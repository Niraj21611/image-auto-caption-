"use server";

import prisma from "../prisma";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

type JobStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

interface JobState {
  id: string;
  dirPath: string;
  images: string[];
  total: number;
  processed: number;
  status: JobStatus;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

const jobs: Map<string, JobState> = new Map();

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png"]);

async function listImagesRecursive(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(p: string) {
    const entries = await fs.promises.readdir(p, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(p, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (IMAGE_EXTS.has(ext)) out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

export async function analyzeDirectory(dirPath: string) {
  try {
    if (!dirPath) return { success: false, error: "Path is required" };
    const stats = await fs.promises.stat(dirPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return {
        success: false,
        error: "Provided path is not a directory or not accessible",
      };
    }

    const images = await listImagesRecursive(dirPath);
    const id = randomUUID();
    const job: JobState = {
      id,
      dirPath,
      images,
      total: images.length,
      processed: 0,
      status: "idle",
    };
    jobs.set(id, job);
    return { success: true, jobId: id, count: images.length };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("analyzeDirectory error:", msg);
    return { success: false, error: msg || "Failed to analyze directory" };
  }
}

function toBase64(filePath: string) {
  const data = fs.readFileSync(filePath);
  return `data:image/${path.extname(filePath).slice(1)};base64,${data.toString(
    "base64"
  )}`;
}

async function backoffDelay(attempt: number) {
  const base = 500; // ms
  const max = 5000;
  const jitter = Math.random() * 200;
  const delay = Math.min(max, base * 2 ** attempt) + jitter;
  return new Promise((res) => setTimeout(res, delay));
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };


async function captionBatchWithOpenAI(batch: string[]): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  // Build a multi-image prompt asking for a JSON array of captions
  const content: ContentPart[] = [
    {
      type: "text",
      text: "You are an assistant that writes a concise, human-friendly caption for each provided image. Return a pure JSON array of strings, one caption per image, in the same order. No extra text.",
    },
  ];
  for (const imgPath of batch) {
    const dataUrl = toBase64(imgPath);
    content.push({
      type: "image_url",
      image_url: { url: dataUrl },
    });
  }

  const body = {
    model: "gpt-4o", // Vision-capable
    messages: [
      {
        role: "user",
        content,
      },
    ],
    temperature: 0.2,
  };

  let attempt = 0;
  while (true) {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (resp.status === 429 || resp.status >= 500) {
      if (attempt < 5) {
        await backoffDelay(attempt++);
        continue;
      }
    }
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OpenAI error (${resp.status}): ${text}`);
    }
    const data = await resp.json();
    const out = data.choices?.[0]?.message?.content?.trim() || "";
    try {
      const arr = JSON.parse(out);
      if (Array.isArray(arr)) return arr.map(String);
    } catch {}
    // Fallback: split lines
    return out
      .split(/\r?\n/)
      .map((s: string) => s.trim())
      .filter(Boolean);
  }
}

export async function startProcessing(jobId: string, batchSize = 5) {
  const job = jobs.get(jobId);
  if (!job) return { success: false, error: "Invalid job id" };
  if (job.status === "running") return { success: true, started: false };

  job.status = "running";
  job.startedAt = Date.now();
  jobs.set(jobId, job);

  (async () => {
    try {
      for (let i = 0; i < job.images.length; i += batchSize) {
        const batch = job.images.slice(i, i + batchSize);
        let captions: string[] = [];
        try {
          captions = await captionBatchWithOpenAI(batch);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("caption batch failed:", msg);
          // On total batch failure, mark each item with a generic caption
          captions = batch.map(() => "");
        }

        // Ensure length alignment
        if (captions.length !== batch.length) {
          // pad/truncate
          if (captions.length < batch.length) {
            captions = captions.concat(
              Array(batch.length - captions.length).fill("")
            );
          } else {
            captions = captions.slice(0, batch.length);
          }
        }

        for (let k = 0; k < batch.length; k++) {
          const filePath = batch[k];
          const preCaption = captions[k] || "";
          try {
            await prisma.imageCaption.upsert({
              where: { filePath },
              create: {
                filePath,
                status: "CAPTIONED",
                preCaption,
                postCaption: null,
              },
              update: {
                status: "CAPTIONED",
                preCaption,
              },
            });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("DB upsert error for", filePath, msg);
          }
          job.processed += 1;
        }
        jobs.set(jobId, job);
      }
      job.status = "completed";
      job.finishedAt = Date.now();
      jobs.set(jobId, job);
    } catch (err: unknown) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Processing failed";
      job.finishedAt = Date.now();
      jobs.set(jobId, job);
    }
  })();

  return { success: true, started: true };
}

export async function getProgress(jobId: string) {
  const j = jobs.get(jobId);
  if (!j) return { success: false, error: "Invalid job id" };
  return {
    success: true,
    job: {
      status: j.status,
      total: j.total,
      processed: j.processed,
      dirPath: j.dirPath,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
      error: j.error,
    },
  };
}

export async function getHistory(limit = 50) {
  try {
    const records = await prisma.imageCaption.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { filePath: true },
    });
    const counts = new Map<string, number>();
    for (const r of records) {
      const dir = path.dirname(r.filePath);
      counts.set(dir, (counts.get(dir) || 0) + 1);
    }
    const rows = Array.from(counts.entries())
      .slice(0, limit)
      .map(([dirPath, count]) => ({ dirPath, count }));
    return { success: true, data: rows };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("getHistory error:", msg);
    return { success: false, error: msg || "Failed to fetch history" };
  }
}
