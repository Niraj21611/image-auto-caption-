"use server";

import prisma from "../prisma";
import fs from "fs";
import path from "path";
import os from "os";
import { Worker } from "node:worker_threads";
import OpenAI from "openai";
import pLimit from "p-limit";
// import { randomUUID } from "crypto";

type JobStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

interface JobState {
  id: string;
  dirPath: string;
  images: string[];
  total: number;
  processed: number;
  failed: number;
  status: JobStatus;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

const jobs: Map<string, JobState> = new Map();

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

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
    // Persist job in DB for history/recovery
    const jobRecord = await prisma.imageJob.create({
      data: {
        dirPath,
        totalImages: images.length,
        processed: 0,
        status: "READY",
      },
      select: { id: true },
    });
    const id = jobRecord.id;
    const job: JobState = {
      id,
      dirPath,
      images,
      total: images.length,
      processed: 0,
      failed: 0,
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

// Removed legacy in-process OpenAI captioning helpers in favor of worker-based processing

// ContentPart type was used by removed legacy function; no longer needed


// async function captionBatchWithOpenAI(...) was removed as we now process in worker threads

export async function startProcessing(
  jobId: string,
  batchSize: number = 5,
  dirPath?: string,
  concurrency?: number
) {
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
          failed: 0,
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

  // Reflect running state in DB if the job exists
  try {
    await prisma.imageJob.update({ where: { id: jobId }, data: { status: "RUNNING", processed: 0 } });
  } catch {}

  (async () => {
    try {
      // Build worker pool and process in parallel batches
  const cpu = Math.max(1, (os.cpus()?.length || 2) - 1);
  const envConcurrency = Number.parseInt(process.env.CAPTION_CONCURRENCY || "", 10);
  const forceSerial = String(process.env.CAPTION_FORCE_SERIAL || "").toLowerCase() === "1";
  const requested = typeof concurrency === "number" && !Number.isNaN(concurrency) ? concurrency : (isNaN(envConcurrency) ? 1 : envConcurrency);
  const poolSize = forceSerial ? 1 : Math.max(1, Math.min(requested, 6, cpu));
      const apiKey = process.env.OPENAI_API_KEY || "";
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const workerPath = path.resolve(process.cwd(), "lib/workers/captionWorker.mjs");

      // Seed processed count with already-captioned images and skip them
      const already = await prisma.imageCaption.findMany({
        where: { filePath: { in: job.images } },
        select: { filePath: true },
      });
      const doneSet = new Set(already.map((a) => a.filePath));
      job.processed = doneSet.size;
      try {
        await prisma.imageJob.update({ where: { id: jobId }, data: { processed: job.processed } });
      } catch {}
      const remainingImages = job.images.filter((f) => !doneSet.has(f));

  const configuredBatch = Number.parseInt(process.env.CAPTION_BATCH_SIZE || "", 10);
  // Request override (batchSize param) has highest priority
  const requestedBatch = typeof batchSize === "number" && !Number.isNaN(batchSize) ? batchSize : undefined;
  const effBatchSizeRaw = Math.max(1, (requestedBatch ?? (isNaN(configuredBatch) ? 5 : configuredBatch)));
  const effBatchSize = forceSerial ? 1 : effBatchSizeRaw;
      const batches: string[][] = [];
      for (let i = 0; i < remainingImages.length; i += effBatchSize) {
        batches.push(remainingImages.slice(i, i + effBatchSize));
      }

      // Track if we should stop (check DB status periodically)
      let shouldStop = false;
      const checkStop = async () => {
        try {
          const rec = await prisma.imageJob.findUnique({ where: { id: jobId }, select: { status: true } });
          if (rec?.status === "CANCELLED") {
            shouldStop = true;
          }
        } catch {}
      };

      let cursor = 0;
      async function runNext(): Promise<void> {
        if (shouldStop) return; // stop early if cancelled
        const idx = cursor++;
        if (idx >= batches.length) return;
        const batch = batches[idx];
        // Re-check completion for this batch to avoid redundant worker calls
        const work = batch.filter((f) => !doneSet.has(f));
        if (work.length === 0) {
          // Nothing left to do in this batch
          return;
        }
        
        // Periodic stop check every 3 batches
        if (idx % 3 === 0) await checkStop();
        if (shouldStop) return;

        try {
          const captions = await new Promise<string[]>((resolve, reject) => {
            let w: Worker;
            try {
              const workerURL = new URL("../workers/captionWorker.mjs", import.meta.url);
              // Cast to any to allow 'type' as TS WorkerOptions may miss it in our types
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              w = new Worker(workerURL as unknown as string, { ...( { type: "module" } as any) });
            } catch  {
              try {
                // Fallback to filesystem path; ensure ESM type
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                w = new Worker(workerPath as unknown as string, { ...( { type: "module" } as any) });
              } catch (err) {
                return reject(err);
              }
            }
            const baseTimeout = Number.parseInt(process.env.CAPTION_WORKER_TIMEOUT_BASE_MS || "", 10);
            const perImageTimeout = Number.parseInt(process.env.CAPTION_WORKER_TIMEOUT_PER_IMAGE_MS || "", 10);
            const fallbackMs = Number.parseInt(process.env.CAPTION_WORKER_TIMEOUT_MS || "", 10);
            // Backward compat: CAPTION_WORKER_TIMEOUT_MS overrides if set
            const dynamicMs = (isNaN(baseTimeout) ? 180000 : Math.max(30000, baseTimeout)) + (isNaN(perImageTimeout) ? 30000 : Math.max(0, perImageTimeout)) * batch.length;
            let ms = isNaN(fallbackMs) ? dynamicMs : Math.max(30000, fallbackMs);
            // Hard cap to 15 minutes to avoid runaway workers
            ms = Math.min(ms, 15 * 60 * 1000);

            let to: NodeJS.Timeout | undefined = setTimeout(() => {
              try { w.terminate(); } catch {}
              reject(new Error("Worker timed out"));
            }, ms);

            const resetTimer = () => {
              if (to) clearTimeout(to);
              to = setTimeout(() => {
                try { w.terminate(); } catch {}
                reject(new Error("Worker timed out"));
              }, ms);
            };

            const onMessage = (msg: unknown) => {
              const m = msg as { ok?: boolean; captions?: unknown; error?: unknown; type?: string };
              if (m?.ok) {
                if (to) clearTimeout(to);
                w.removeAllListeners("message");
                w.removeAllListeners("error");
                const arr = Array.isArray(m.captions) ? (m.captions as string[]) : [];
                return resolve(arr);
              }
              if (m?.type === "progress") {
                // Heartbeat/progress from worker; keep it alive
                resetTimer();
                return;
              }
              if (m && Object.prototype.hasOwnProperty.call(m, "error")) {
                if (to) clearTimeout(to);
                w.removeAllListeners("message");
                w.removeAllListeners("error");
                const em = (m as { error?: string }).error ?? "Worker failed";
                return reject(new Error(em));
              }
            };

            w.on("message", onMessage);
            w.once("error", (err) => {
              if (to) clearTimeout(to);
              w.removeAllListeners("message");
              reject(err);
            });
            w.postMessage({ images: work, apiKey, model });
          });

          while (captions.length < work.length) captions.push("");
          if (captions.length > work.length) captions.length = work.length;

          for (let k = 0; k < work.length; k++) {
            const filePath = work[k];
            const preCaption = captions[k] || "";
            try {
              // Skip if already exists (race-safe)
              const existing = await prisma.imageCaption.findUnique({ where: { filePath }, select: { id: true } });
              if (existing) {
                // Count it as processed baseline; no DB upsert needed
                continue;
              }
              await prisma.imageCaption.upsert({
                where: { filePath },
                create: {
                  filePath,
                  status: "CAPTIONED",
                  preCaption,
                  postCaption: null,
                  jobId,
                },
                update: {
                  status: "CAPTIONED",
                  preCaption,
                  jobId,
                },
              });
              job!.processed += 1;
              doneSet.add(filePath);
              jobs.set(jobId, job as JobState);
              try {
                await prisma.imageJob.update({ where: { id: jobId }, data: { processed: job!.processed } });
              } catch {}
            } catch (err) {
              console.error("DB upsert error for", filePath, err);
              job!.failed += 1;
              try {
                await prisma.imageJob.update({ where: { id: jobId }, data: { failed: job!.failed } });
              } catch {}
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Worker batch failed:", msg);
          // Handle rate limit by re-queuing with backoff
          if (/rate limit|429/i.test(msg)) {
            const delay = 1200 + Math.floor(Math.random() * 600);
            await new Promise((r) => setTimeout(r, delay));
            // Re-enqueue only pending items not yet processed
            const pending = batch.filter((f) => !doneSet.has(f));
            if (pending.length) batches.push(pending);
          } else {
            // Count whole batch as failed and continue
            job!.failed += work.length;
            try {
              await prisma.imageJob.update({ where: { id: jobId }, data: { failed: job!.failed } });
            } catch {}
          }
        } finally {
          await runNext();
        }
      }

      const starters = Math.min(poolSize, batches.length);
      const tasks: Promise<void>[] = [];
      for (let i = 0; i < starters; i++) tasks.push(runNext());
      await Promise.all(tasks);

      if (shouldStop) {
        // Job was cancelled; leave status as CANCELLED
        job.status = "cancelled";
        job.finishedAt = Date.now();
        jobs.set(jobId, job);
        try {
          await prisma.imageJob.update({ where: { id: jobId }, data: { status: "CANCELLED" } });
        } catch {}
      } else {
        // Only mark COMPLETED if all images are processed
        if (job.processed >= job.total) {
          job.status = "completed";
          try {
            await prisma.imageJob.update({ where: { id: jobId }, data: { status: "COMPLETED" } });
          } catch {}
        } else {
          job.status = "failed";
          try {
            await prisma.imageJob.update({ where: { id: jobId }, data: { status: "FAILED" } });
          } catch {}
        }
        job.finishedAt = Date.now();
        jobs.set(jobId, job);
      }
    } catch (err: unknown) {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : "Processing failed";
      job.finishedAt = Date.now();
      jobs.set(jobId, job);
      try {
        await prisma.imageJob.update({ where: { id: jobId }, data: { status: "FAILED" } });
      } catch {}
    }
  })();

  return { success: true, started: true };
}

export async function stopProcessing(jobId: string) {
  try {
    // Update DB to CANCELLED so it stops polling and can be resumed
    await prisma.imageJob.update({ where: { id: jobId }, data: { status: "CANCELLED" } });
    // Clear in-memory job if present
    const job = jobs.get(jobId);
    if (job) {
      job.status = "cancelled";
      jobs.set(jobId, job);
    }
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function getProgress(jobId: string, dirPath?: string) {
  // Prefer ImageJob in DB as the source of truth if present
  try {
    const rec = await prisma.imageJob.findUnique({ where: { id: jobId } });
    if (rec) {
      const statusMap: Record<string, JobStatus> = {
        READY: "idle",
        RUNNING: "running",
        COMPLETED: "completed",
        FAILED: "failed",
        CANCELLED: "cancelled",
      };
      let mappedStatus: JobStatus = statusMap[rec.status] || (rec.status?.toLowerCase() as JobStatus) || "idle";
      const isDoneByCounts = rec.totalImages > 0 && rec.processed >= rec.totalImages;
      if (isDoneByCounts && rec.status !== "COMPLETED") {
        // Self-heal DB status to keep UI and DB aligned
        try {
          await prisma.imageJob.update({ where: { id: jobId }, data: { status: "COMPLETED" } });
          mappedStatus = "completed";
        } catch {
          // If update fails, do NOT present completed; keep DB truth to avoid mismatch complaints
        }
      }
      return {
        success: true,
        job: {
          status: mappedStatus,
          total: rec.totalImages,
          processed: rec.processed,
          dirPath: rec.dirPath,
          startedAt: rec.createdAt ? new Date(rec.createdAt).getTime() : undefined,
          finishedAt: rec.status === "COMPLETED" ? (rec.updatedAt ? new Date(rec.updatedAt).getTime() : undefined) : undefined,
          error: undefined,
        },
      };
    }
  } catch {}

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
    const jobs = await prisma.imageJob.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, dirPath: true, processed: true, totalImages: true, status: true, createdAt: true },
    });
    const rows = jobs.map((j) => ({
      jobId: j.id,
      dirPath: j.dirPath,
      status: j.status,
      processed: j.processed,
      total: j.totalImages,
      createdAt: j.createdAt.toISOString(),
    }));
    return { success: true, data: rows };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("getHistory error:", msg);
    return { success: false, error: msg || "Failed to fetch history" };
  }
}

// --------------------
// New OpenAI Batch Flow
// --------------------

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey });
}


export async function prepareAndUpload(dirPath: string) {
  try {
    if (!dirPath) return { success: false, error: "Path is required" };
    const stats = await fs.promises.stat(dirPath).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      return { success: false, error: "Provided path is not a directory or not accessible" };
    }

    const images = await listImagesRecursive(dirPath);
    const job = await prisma.imageJob.create({
      data: {
        dirPath,
        totalImages: images.length,
        processed: 0,
        failed: 0,
        status: "UPLOADING",
      },
      select: { id: true },
    });

    const openai = getOpenAIClient();
    const limit = pLimit(3);

    let uploaded = 0;
    const tasks = images.map((filePath) => limit(async () => {
      // Ensure ImageCaption row exists first
      const existing = await prisma.imageCaption.findUnique({ where: { filePath }, select: { id: true } });
      let capId: string;
      if (!existing) {
        const created = await prisma.imageCaption.create({
          data: { filePath, preCaption: "", postCaption: null, jobId: job.id },
          select: { id: true },
        });
        capId = created.id;
      } else {
        // Attach to job if not set
        await prisma.imageCaption.update({ where: { filePath }, data: { jobId: job.id } });
        capId = existing.id;
      }

      // Upload file to OpenAI Files
      try {
        const file = await openai.files.create({ file: fs.createReadStream(filePath), purpose: "assistants" });
        await prisma.imageCaption.update({ where: { id: capId }, data: { openaiFileId: file.id } });
        uploaded += 1;
      } catch {
        // If upload fails, record as failed but continue
        await prisma.imageJob.update({ where: { id: job.id }, data: { failed: { increment: 1 } } });
      }
    }));

    await Promise.all(tasks);

    await prisma.imageJob.update({ where: { id: job.id }, data: { status: "READY" } });

    return { success: true, data: { jobId: job.id, total: images.length, uploaded } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function createCaptionBatch(jobId: string, prompt: string, model = process.env.OPENAI_MODEL || "gpt-4o-mini") {
  try {
    if (!jobId) return { success: false, error: "jobId is required" };
    const job = await prisma.imageJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: "Job not found" };

    const captions = await prisma.imageCaption.findMany({
      where: { jobId, openaiFileId: { not: null } },
      select: { id: true, openaiFileId: true },
    });
    if (captions.length === 0) return { success: false, error: "No images uploaded for batch" };

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "jsonl-"));
    const jsonlPath = path.join(tmpDir, `batch-${jobId}.jsonl`);

    const lines = captions.map((c) => {
      const body = {
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt || "Write a concise, descriptive caption for this image." },
              { type: "input_image", image_url: { file_id: c.openaiFileId } },
            ],
          },
        ],
        max_output_tokens: 300,
      };
      return JSON.stringify({
        custom_id: c.id,
        method: "POST",
        url: "/v1/responses",
        body,
      });
    });

    await fs.promises.writeFile(jsonlPath, lines.join("\n"), "utf8");

    const openai = getOpenAIClient();
  const uploaded = await openai.files.create({ file: fs.createReadStream(jsonlPath), purpose: "batch" });
    const batch = await openai.batches.create({ input_file_id: uploaded.id, endpoint: "/v1/responses", completion_window: "24h" });

    await prisma.imageJob.update({ where: { id: jobId }, data: { batchId: batch.id, status: "BATCH_SUBMITTED" } });

    return { success: true, data: { batchId: batch.id } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractTextFromResponse(resp: unknown): string {
  try {
    const r = resp as Record<string, unknown> | undefined;
    // New SDK may include convenience field
    if (r && typeof (r as any).output_text === "string") return String((r as any).output_text);
    const output = (r as any)?.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        const content = (item as any)?.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            const p: any = part;
            if (p?.type === "output_text" && typeof p?.text === "string") return p.text;
            if (p?.type === "text" && typeof p?.text === "string") return p.text;
          }
        }
      }
    }
  } catch {}
  return "";
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function pollBatchAndIngest(jobId: string) {
  try {
    if (!jobId) return { success: false, error: "jobId is required" };
    const job = await prisma.imageJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: "Job not found" };
    if (!job.batchId) return { success: false, error: "Batch not created yet" };

    const openai = getOpenAIClient();
    const batch = await openai.batches.retrieve(job.batchId);

    if (batch.status === "completed") {
      // If already completed and previously ingested, short-circuit
      if (job.status === "COMPLETED") {
        return { success: true, data: { status: "completed", processed: job.processed, failed: job.failed, total: job.totalImages } };
      }

  const outputFileId = (batch as unknown as { output_file_id?: string })?.output_file_id;
      if (!outputFileId) return { success: false, error: "No output file on completed batch" };

      const fileResp = await openai.files.content(outputFileId as string);
      // node Response to string
      const text = Buffer.from(await fileResp.arrayBuffer()).toString("utf8");
      const lines = text.split(/\r?\n/).filter(Boolean);

      let ok = 0;
      let bad = 0;
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          if (obj.error) {
            bad += 1;
            continue;
          }
          const customId: string = obj.custom_id;
          const resp = obj.response;
          const caption = extractTextFromResponse(resp);
          if (customId && typeof caption === "string") {
            const existing = await prisma.imageCaption.findUnique({ where: { id: customId }, select: { preCaption: true } });
            if (!existing || (existing && !existing.preCaption)) {
              await prisma.imageCaption.update({ where: { id: customId }, data: { preCaption: caption } });
            }
            ok += 1;
          } else {
            bad += 1;
          }
        } catch {
          bad += 1;
        }
      }

      const processed = ok;
      const failed = bad;
      const newStatus = processed + failed >= (job.totalImages || 0) ? "COMPLETED" : "PARTIAL";
      await prisma.imageJob.update({ where: { id: jobId }, data: { processed, failed, status: newStatus } });

      return { success: true, data: { status: "completed", processed, failed, total: job.totalImages } };
    }

    // Non-terminal states pass through
    return { success: true, data: { status: batch.status, processed: job.processed, failed: job.failed, total: job.totalImages } };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
