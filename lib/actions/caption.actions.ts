"use server";

import prisma from "../prisma";
import fs from "fs";
import path from "path";
import os from "os";
import OpenAI from "openai";
import pLimit from "p-limit";

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

type PreparationPhase = "PREPARING" | "READY" | "FAILED";

interface PreparationState {
  jobId: string;
  dirPath: string;
  total: number;
  uploaded: number;
  failed: number;
  status: PreparationPhase;
  startedAt: number;
  updatedAt: number;
}

const preparationStates: Map<string, PreparationState> = new Map();

function computeEtaSeconds(state: PreparationState): number | null {
  if (!state.uploaded || state.uploaded <= 0) return null;
  const elapsedMs = Date.now() - state.startedAt;
  if (elapsedMs <= 0) return null;
  const perItem = elapsedMs / state.uploaded;
  const remaining = Math.max(state.total - state.uploaded, 0);
  if (remaining === 0) return 0;
  return Math.round((perItem * remaining) / 1000);
}

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

export async function getHistory(limit = 50) {
  try {
    const openai = getOpenAIClient();
    const jobs = await prisma.imageJob.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        dirPath: true,
        processed: true,
        totalImages: true,
        status: true,
        createdAt: true,
        batchId: true,
      },
    });

    const limiter = pLimit(3);

    const rows = await Promise.all(
      jobs.map((j) =>
        limiter(async () => {
          let status = j.status;
          const processed = j.processed; 
          const total = j.totalImages;

          const mapStatus = (s: string): string => {
            switch (s) {
              case "in_progress":
              case "validating":
              case "finalizing":
                return "RUNNING";
              case "completed":
                return "COMPLETED";
              case "failed":
                return "FAILED";
              case "cancelled":
                return "CANCELLED";
              default:
                return status;
            }
          };

          try {
            if (j.batchId) {
              const b = await openai.batches.retrieve(j.batchId);
              const mapped = mapStatus(b.status);
              if (mapped !== j.status) {
                status = mapped;
                await prisma.imageJob.update({
                  where: { id: j.id },
                  data: { status },
                });
              }
                }
          } catch {
          }

          return {
            jobId: j.id,
            dirPath: j.dirPath,
            status,
            processed,
            total,
            createdAt: j.createdAt.toISOString(),
          };
        })
      )
    );

    return { success: true, data: rows };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("getHistory error:", msg);
    return { success: false, error: msg || "Failed to fetch history" };
  }
}

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
      return {
        success: false,
        error: "Provided path is not a directory or not accessible",
      };
    }

    const images = await listImagesRecursive(dirPath);
    if (images.length === 0) {
      return { success: false, error: "No images found in directory" };
    }

    const job = await prisma.imageJob.create({
      data: {
        dirPath,
        totalImages: images.length,
        processed: 0,
        failed: 0,
        status: "PREPARING",
      },
      select: { id: true, dirPath: true },
    });

    const initialState: PreparationState = {
      jobId: job.id,
      dirPath,
      total: images.length,
      uploaded: 0,
      failed: 0,
      status: "PREPARING",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    preparationStates.set(job.id, initialState);

    void (async () => {
      const openai = getOpenAIClient();
      const limit = pLimit(3);
      const state = { ...initialState };

      const uploadFile = async (filePath: string) => {
        // Ensure ImageCaption row exists first
        const existing = await prisma.imageCaption.findUnique({
          where: { filePath },
          select: { id: true },
        });
        let capId: string;
        if (!existing) {
          const created = await prisma.imageCaption.create({
            data: {
              filePath,
              preCaption: "",
              postCaption: null,
              jobId: job.id,
            },
            select: { id: true },
          });
          capId = created.id;
        } else {
          await prisma.imageCaption.update({
            where: { filePath },
            data: { jobId: job.id },
          });
          capId = existing.id;
        }

        try {
          const file = await openai.files.create({
            file: fs.createReadStream(filePath),
            purpose: "vision",
          });
          await prisma.imageCaption.update({
            where: { id: capId },
            data: { openaiFileId: file.id, status: "CAPTIONED" },
          });
          state.uploaded += 1;
        } catch (err) {
          state.failed += 1;
          await prisma.imageCaption.update({
            where: { id: capId },
            data: { status: "FAILED" },
          });
          console.error("Failed to upload image", filePath, err);
        } finally {
          state.updatedAt = Date.now();
          preparationStates.set(job.id, { ...state });
        }
      };

      try {
        await Promise.all(
          images.map((filePath) => limit(() => uploadFile(filePath)))
        );
        const finalStatus: PreparationPhase =
          state.uploaded > 0 ? "READY" : "FAILED";
        state.status = finalStatus;
        state.updatedAt = Date.now();
        preparationStates.set(job.id, { ...state });
        await prisma.imageJob.update({
          where: { id: job.id },
          data: {
            status: finalStatus === "READY" ? "READY" : "FAILED",
            failed: state.failed,
          },
        });
      } catch (err) {
        state.status = "FAILED";
        state.updatedAt = Date.now();
        preparationStates.set(job.id, { ...state });
        await prisma.imageJob.update({
          where: { id: job.id },
          data: { status: "FAILED" },
        });
        console.error("prepareAndUpload background failure", err);
      }
    })();

    return {
      success: true,
      data: { jobId: job.id, total: images.length },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function getPreparationStatus(jobId: string) {
  try {
    if (!jobId) return { success: false, error: "jobId is required" };
    const state = preparationStates.get(jobId);
    if (state) {
      return {
        success: true,
        data: {
          jobId: state.jobId,
          dirPath: state.dirPath,
          total: state.total,
          uploaded: state.uploaded,
          failed: state.failed,
          status: state.status,
          etaSeconds: computeEtaSeconds(state),
        },
      };
    }

    const job = await prisma.imageJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        dirPath: true,
        status: true,
        totalImages: true,
        failed: true,
      },
    });
    if (!job) return { success: false, error: "Job not found" };

    const fallbackStatus: PreparationPhase =
      job.status === "READY"
        ? "READY"
        : job.status === "FAILED"
        ? "FAILED"
        : "PREPARING";

    return {
      success: true,
      data: {
        jobId: job.id,
        dirPath: job.dirPath,
        total: job.totalImages ?? 0,
        uploaded: fallbackStatus === "READY" ? job.totalImages ?? 0 : 0,
        failed: job.failed ?? 0,
        status: fallbackStatus,
        etaSeconds: null,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function createCaptionBatch(
  jobId: string,
  prompt: string,
  model = process.env.OPENAI_MODEL || "gpt-4o-mini"
) {
  try {
    if (!jobId) return { success: false, error: "jobId is required" };

    const job = await prisma.imageJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: "Job not found" };

    const captions = await prisma.imageCaption.findMany({
      where: { jobId, openaiFileId: { not: null } },
      select: { id: true, openaiFileId: true },
    });

    if (captions.length === 0)
      return { success: false, error: "No images uploaded for batch" };

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "jsonl-"));
    const jsonlPath = path.join(tmpDir, `batch-${jobId}.jsonl`);

    const lines = captions.map((c) => {
      return JSON.stringify({
        custom_id: c.id,
        method: "POST",
        url: "/v1/responses",
        body: {
          model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text:
                    prompt ||
                    "Write a concise, descriptive caption for this image.",
                },
                {
                  type: "input_image",
                  file_id: `${c.openaiFileId}`,
                },
              ],
            },
          ],
          max_output_tokens: 300,
        },
      });
    });

    // Write JSONL
    await fs.promises.writeFile(jsonlPath, lines.join("\n"), "utf8");

    // Upload JSONL
    const openai = getOpenAIClient();
    const uploaded = await openai.files.create({
      file: fs.createReadStream(jsonlPath),
      purpose: "batch",
    });

    const batch = await openai.batches.create({
      input_file_id: uploaded.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    await prisma.imageJob.update({
      where: { id: jobId },
      data: { batchId: batch.id, status: "BATCH_SUBMITTED" },
    });

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
    if (r && typeof (r as any).output_text === "string")
      return String((r as any).output_text);
    const output = (r as any)?.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        const content = (item as any)?.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            const p: any = part;
            if (p?.type === "output_text" && typeof p?.text === "string")
              return p.text;
            if (p?.type === "text" && typeof p?.text === "string")
              return p.text;
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

    // Handle failed batch early
    if (batch.status === "failed") {
      // Attempt to parse error file for granular failures; fallback mark all
      let failedIds: string[] = [];
      try {
        const errorFileId = (batch as unknown as { error_file_id?: string })
          ?.error_file_id;
        if (errorFileId) {
          const fileResp = await openai.files.content(errorFileId);
          const text = Buffer.from(await fileResp.arrayBuffer()).toString(
            "utf8"
          );
          const lines = text.split(/\r?\n/).filter(Boolean);
          for (const line of lines) {
            try {
              const obj = JSON.parse(line);
              if (obj?.custom_id) failedIds.push(String(obj.custom_id));
            } catch {}
          }
        }
      } catch {
        // swallow error file issues
      }
      if (failedIds.length === 0) {
        const all = await prisma.imageCaption.findMany({
          where: { jobId },
          select: { id: true },
        });
        failedIds = all.map((a) => a.id);
      }
      await prisma.imageCaption.updateMany({
        where: { id: { in: failedIds } },
        data: { status: "FAILED" },
      });
      await prisma.imageJob.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          failed: failedIds.length,
          processed: 0,
        },
      });
      return {
        success: true,
        data: {
          status: "FAILED",
          processed: 0,
          failed: failedIds.length,
          total: job.totalImages,
        },
      };
    }

    if (batch.status === "completed") {
      // Auto-ingestion disabled: only mark job as COMPLETED; captions populated via manual ingestBatchOutput
      if (job.status !== "COMPLETED") {
        await prisma.imageJob.update({
          where: { id: jobId },
          data: { status: "COMPLETED" },
        });
      }
      return {
        success: true,
        data: {
          status: "COMPLETED",
          processed: job.processed,
          failed: job.failed,
          total: job.totalImages,
        },
      };
    }

    // Non-terminal states pass through (normalize to RUNNING / BATCH_SUBMITTED where helpful)
    // Normalize status defensively without using any
    const statusVal = (batch as { status?: unknown }).status;
    const rawStatus =
      typeof statusVal === "string" ? statusVal : String(statusVal);
    const mappedStatus = (() => {
      switch (rawStatus) {
        case "in_progress":
        case "validating":
        case "finalizing":
          return "RUNNING";
        case "completed":
          return "COMPLETED";
        case "failed":
          return "FAILED";
        case "cancelled":
          return "CANCELLED";
        default:
          return rawStatus;
      }
    })();
    return {
      success: true,
      data: {
        status: mappedStatus,
        processed: job.processed,
        failed: job.failed,
        total: job.totalImages,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function recreateFailedCaptionBatch(
  jobId: string,
  prompt: string = "Write a concise, descriptive caption for this image.",
  model = process.env.OPENAI_MODEL || "gpt-4o-mini"
) {
  try {
    if (!jobId) return { success: false, error: "jobId is required" };
    const job = await prisma.imageJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: "Job not found" };

    // Select only FAILED captions that still have an uploaded file reference
    const failedCaps = await prisma.imageCaption.findMany({
      where: { jobId, status: "FAILED", openaiFileId: { not: null } },
      select: { id: true, openaiFileId: true },
    });
    if (failedCaps.length === 0)
      return {
        success: false,
        error: "No failed items with uploaded files to recreate",
      };

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "jsonl-"));
    const jsonlPath = path.join(tmpDir, `retry-batch-${jobId}.jsonl`);

    const lines = failedCaps.map((c) =>
      JSON.stringify({
        custom_id: c.id,
        method: "POST",
        url: "/v1/responses",
        body: {
          model,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: prompt },
                { type: "input_image", image: { id: c.openaiFileId } },
              ],
            },
          ],
          max_output_tokens: 300,
        },
      })
    );
    await fs.promises.writeFile(jsonlPath, lines.join("\n"), "utf8");
    const openai = getOpenAIClient();
    const uploaded = await openai.files.create({
      file: fs.createReadStream(jsonlPath),
      purpose: "batch",
    });
    const batch = await openai.batches.create({
      input_file_id: uploaded.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });
    await prisma.imageJob.update({
      where: { id: jobId },
      data: { batchId: batch.id, status: "BATCH_SUBMITTED", failed: 0 },
    });
    // Reset status of those captions to indicate retry pending
    await prisma.imageCaption.updateMany({
      where: { id: { in: failedCaps.map((c) => c.id) } },
      data: { status: "CAPTIONED" }, // back to uploaded state (could define RETRYING if desired)
    });
    return { success: true, data: { batchId: batch.id } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function ingestBatchOutput(jobId: string) {
  try {
    if (!jobId) return { success: false, error: "jobId is required" };
    const job = await prisma.imageJob.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: "Job not found" };
    if (!job.batchId) return { success: false, error: "Batch not associated with job" };

    if (!["COMPLETED", "SUCCESSFUL"].includes(job.status)) {
      return { success: false, error: "Batch not completed yet" };
    }

    const openai = getOpenAIClient();
    const batch = await openai.batches.retrieve(job.batchId);
    const outputFileId = (batch as unknown as { output_file_id?: string })?.output_file_id;
    if (!outputFileId) return { success: false, error: "No output file present for batch" };

    const fileResp = await openai.files.content(outputFileId);
    const text = Buffer.from(await fileResp.arrayBuffer()).toString("utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);

    const successIds = new Set<string>();
    const failedIds = new Set<string>();

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const customId: string | undefined = obj.custom_id;
        if (!customId) {
          failedIds.add("__unknown__");
          continue;
        }
        if (obj.error) {
          failedIds.add(customId);
          continue;
        }
        const caption = extractTextFromResponse(obj.response);
        if (caption && caption.trim().length) {
          await prisma.imageCaption.update({
            where: { id: customId },
            data: { preCaption: caption, status: "CAPTIONED" },
          });
          successIds.add(customId);
        } else {
          failedIds.add(customId);
        }
      } catch {
        failedIds.add("__parse__");
      }
    }

    // Mark any remaining captions (referenced by job) that were not found as failed
    const allCaps = await prisma.imageCaption.findMany({
      where: { jobId },
      select: { id: true },
    });
    for (const c of allCaps) {
      if (!successIds.has(c.id) && !failedIds.has(c.id)) failedIds.add(c.id);
    }
    if (failedIds.size) {
      // Exclude synthetic markers before DB update
      const concreteFailed = Array.from(failedIds).filter(
        (f) => !f.startsWith("__")
      );
      if (concreteFailed.length) {
        await prisma.imageCaption.updateMany({
          where: { id: { in: concreteFailed } },
          data: { status: "FAILED" },
        });
      }
    }

    const processed = successIds.size;
    const failed = Array.from(failedIds).filter((f) => !f.startsWith("__")).length;
    await prisma.imageJob.update({
      where: { id: jobId },
      data: {
        processed,
        failed,
        status: "SUCCESSFUL",
      },
    });

    return {
      success: true,
      data: { processed, failed, total: job.totalImages, status: "SUCCESSFUL" },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
