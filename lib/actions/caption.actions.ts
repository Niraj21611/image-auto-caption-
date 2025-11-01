"use server";

import prisma from "../prisma";
import fs from "fs";
import path from "path";
import os from "os";
import { Worker } from "node:worker_threads";
// import { randomUUID } from "crypto";

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
  const requested = typeof concurrency === "number" && !Number.isNaN(concurrency) ? concurrency : (isNaN(envConcurrency) ? 1 : envConcurrency);
  const poolSize = Math.max(1, Math.min(requested, 6, cpu));
      const apiKey = process.env.OPENAI_API_KEY || "";
      const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
      if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const workerPath = path.resolve(process.cwd(), "lib/workers/captionWorker.mjs");

  const configuredBatch = Number.parseInt(process.env.CAPTION_BATCH_SIZE || "", 10);
  // Request override (batchSize param) has highest priority
  const requestedBatch = typeof batchSize === "number" && !Number.isNaN(batchSize) ? batchSize : undefined;
  const effBatchSize = Math.max(1, (requestedBatch ?? (isNaN(configuredBatch) ? 5 : configuredBatch)));
      const batches: string[][] = [];
      for (let i = 0; i < job.images.length; i += effBatchSize) {
        batches.push(job.images.slice(i, i + effBatchSize));
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
        
        // Periodic stop check every 3 batches
        if (idx % 3 === 0) await checkStop();
        if (shouldStop) return;

        try {
          const captions = await new Promise<string[]>((resolve, reject) => {
            const w = new Worker(workerPath);
            const to = setTimeout(() => {
              w.terminate();
              reject(new Error("Worker timed out"));
            }, 60000);
            w.once("message", (msg: unknown) => {
              const m = msg as { ok?: boolean; captions?: unknown; error?: unknown };
              clearTimeout(to);
              if (m?.ok) {
                const arr = Array.isArray(m.captions) ? (m.captions as string[]) : [];
                resolve(arr);
              }
              else reject(new Error((m?.error as string) || "Worker failed"));
            });
            w.once("error", (err) => {
              clearTimeout(to);
              reject(err);
            });
            w.postMessage({ images: batch, apiKey, model });
          });

          while (captions.length < batch.length) captions.push("");
          if (captions.length > batch.length) captions.length = batch.length;

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
                  jobId,
                },
                update: {
                  status: "CAPTIONED",
                  preCaption,
                  jobId,
                },
              });
              job!.processed += 1;
              jobs.set(jobId, job as JobState);
              try {
                await prisma.imageJob.update({ where: { id: jobId }, data: { processed: job!.processed } });
              } catch {}
            } catch (err) {
              console.error("DB upsert error for", filePath, err);
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("Worker batch failed:", msg);
          // Handle rate limit by re-queuing with backoff
          if (/rate limit|429/i.test(msg)) {
            const delay = 1200 + Math.floor(Math.random() * 600);
            await new Promise((r) => setTimeout(r, delay));
            // re-enqueue this batch to try again later
            batches.push(batch);
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
      } else {
        job.status = "completed";
        job.finishedAt = Date.now();
        jobs.set(jobId, job);
        try {
          await prisma.imageJob.update({ where: { id: jobId }, data: { status: "COMPLETED" } });
        } catch {}
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
