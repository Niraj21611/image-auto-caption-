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

  function tryParseCaptions(raw: string): string[] | null {
    let text = raw.trim();
    // Strip fenced code blocks like ```json ... ``` or ``` ... ```
    const fenceMatch = text.match(/```[a-zA-Z]*\n?[\s\S]*?```/);
    if (fenceMatch) {
      text = text.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1").trim();
    }
    // Try direct JSON parse
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) return arr.map(String);
    } catch {}
    // Try to extract first JSON array in the text
    const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
      const snippet = jsonArrayMatch[0];
      try {
        const arr = JSON.parse(snippet);
        if (Array.isArray(arr)) return arr.map(String);
      } catch {}
    }
    // Fallback: split lines and filter obvious noise
    const lines = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !s.startsWith("```") && s.toLowerCase() !== "json" && s !== "[" && s !== "]");
    if (lines.length) return lines;
    return null;
  }

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
    const parsed = tryParseCaptions(out);
    if (parsed) return parsed;
    // last resort
    return [out];
  }
}

export async function startProcessing(jobId: string, batchSize = 5, dirPath?: string) {
  let job = jobs.get(jobId);
  if (!job) {
    // Attempt to reconstruct the job if a directory was provided
    if (dirPath) {
      try {
        const stats = await fs.promises.stat(dirPath).catch(() => null);
        if (!stats || !stats.isDirectory()) {
          return { success: false, error: "Provided path is not a directory or not accessible" };
        }
        const images = await listImagesRecursive(dirPath);
        job = {
          id: jobId,
          dirPath,
          images,
          total: images.length,
          processed: 0,
          status: "idle",
        };
        jobs.set(jobId, job);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, error: `Invalid job id and failed to create job: ${msg}` };
      }
    } else {
      return { success: false, error: "Invalid job id" };
    }
  }
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
            // Update progress after each image for real-time updates
            job.processed += 1;
            jobs.set(jobId, job);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error("DB upsert error for", filePath, msg);
          }
        }
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

export async function getProgress(jobId: string, dirPath?: string) {
  const j = jobs.get(jobId);
  if (j) {
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

  // Fallback for serverless/stateless: infer progress from DB + filesystem if dirPath provided
  if (dirPath) {
    try {
      const stats = await fs.promises.stat(dirPath).catch(() => null);
      if (!stats || !stats.isDirectory()) {
        return { success: false, error: "Provided path is not a directory or not accessible" };
      }
      const images = await listImagesRecursive(dirPath);
      const total = images.length;
      // Count processed images stored in DB for this dir using explicit list to avoid regex issues on Windows paths
      const processed = await prisma.imageCaption.count({
        where: { filePath: { in: images } },
      });
      // Earliest and latest timestamps for ETA/finished (also using explicit list)
      const first = await prisma.imageCaption.findFirst({
        where: { filePath: { in: images } },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      const last = await prisma.imageCaption.findFirst({
        where: { filePath: { in: images } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      const status: JobStatus = processed >= total && total > 0 ? "completed" : processed > 0 ? "running" : "idle";
      return {
        success: true,
        job: {
          status,
          total,
          processed,
          dirPath,
          startedAt: first?.createdAt ? first.createdAt.getTime() : undefined,
          finishedAt: status === "completed" && last?.createdAt ? last.createdAt.getTime() : undefined,
          error: undefined,
        },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: msg };
    }
  }

  return { success: false, error: "Invalid job id" };
}

export async function getHistory(limit = 50) {
  try {
    const records = await prisma.imageCaption.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { filePath: true, createdAt: true },
    });
    const dirMap = new Map<string, { count: number; latestCreatedAt: Date }>();
    for (const r of records) {
      const dir = path.dirname(r.filePath);
      const existing = dirMap.get(dir);
      if (existing) {
        existing.count += 1;
        if (r.createdAt > existing.latestCreatedAt) {
          existing.latestCreatedAt = r.createdAt;
        }
      } else {
        dirMap.set(dir, { count: 1, latestCreatedAt: r.createdAt });
      }
    }
    const rows = Array.from(dirMap.entries())
      .sort((a, b) => b[1].latestCreatedAt.getTime() - a[1].latestCreatedAt.getTime())
      .slice(0, limit)
      .map(([dirPath, data]) => ({ 
        dirPath, 
        count: data.count,
        processedAt: data.latestCreatedAt.toISOString()
      }));
    return { success: true, data: rows };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("getHistory error:", msg);
    return { success: false, error: msg || "Failed to fetch history" };
  }
}
