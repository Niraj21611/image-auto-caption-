// ESM Worker: compress images with sharp, call OpenAI Vision for a small batch, return captions
import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import * as fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Global rate-limit tracking file (shared between threads)
const GLOBAL_RATE_LIMIT_FILE = path.join(os.tmpdir?.() || ".", "last_openai_call.txt");

// Ensure fetch exists in worker (for Node <20)
if (typeof fetch !== "function") {
  try {
    const undici = await import("undici");
    // @ts-expect-error dynamic import shape differences across versions
    globalThis.fetch =
      undici.fetch || undici.default?.fetch || globalThis.fetch;
  } catch {
    console.error("[worker] Failed to set fetch via undici");
  }
}

function getEnvInt(name, fallback) {
  const raw = process?.env?.[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function mimeFromExt(ext) {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function toCompressedDataUrl(filePath) {
  try {
    const image = sharp(filePath).rotate();
    const meta = await image.metadata();
    const width = meta.width || 0;
    const target = 800;
    const pipe = width > target ? image.resize(target) : image;
    const buf = await pipe.jpeg({ quality: 70 }).toBuffer();
    const base64 = buf.toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    try {
      const buf = await fsp.readFile(filePath);
      const ext = path.extname(filePath);
      const mime = mimeFromExt(ext);
      const base64 = buf.toString("base64");
      return `data:${mime};base64,${base64}`;
    } catch (e2) {
      throw e2;
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Global rate limiting between all workers ---
async function enforceGlobalRateLimit(minInterval = 8000) {
  try {
    const now = Date.now();
    let last = 0;
    try {
      const raw = await fsp.readFile(GLOBAL_RATE_LIMIT_FILE, "utf8");
      last = Number(raw) || 0;
    } catch {}
    const delta = now - last;
    if (delta < minInterval) {
      await sleep(minInterval - delta + Math.random() * 500);
    }
    await fsp.writeFile(GLOBAL_RATE_LIMIT_FILE, String(Date.now()));
  } catch (err) {
    console.error("[worker] global rate limit error:", err);
  }
}

function tryParseCaptions(raw) {
  let text = String(raw || "").trim();
  const fence = /```[a-zA-Z]*\n?([\s\S]*?)```/g;
  text = text.replace(fence, (_, inner) => inner).trim();
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr.map(String);
  } catch {}
  const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    try {
      const arr = JSON.parse(jsonArrayMatch[0]);
      if (Array.isArray(arr)) return arr.map(String);
    } catch {}
  }
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (s) =>
        !s.startsWith("```") &&
        s.toLowerCase() !== "json" &&
        s !== "[" &&
        s !== "]"
    );
  return lines.length ? lines : null;
}

async function captionBatch({ images, apiKey, model }) {
  if (!apiKey) throw new Error("Missing OpenAI API key in worker");

  const MIN_DELAY_MS = getEnvInt("CAPTION_MIN_DELAY_MS", 12000);
  const BASE_BACKOFF_MS = getEnvInt("CAPTION_BACKOFF_BASE_MS", 8000);
  const MAX_BACKOFF_MS = getEnvInt("CAPTION_BACKOFF_MAX_MS", 120000);
  const MAX_RETRIES = getEnvInt("CAPTION_MAX_RETRIES", 8);

  const results = [];
  // Heartbeat: batch start
  parentPort?.postMessage({ type: "progress", event: "start", total: images.length });

  let index = 0;
  for (const imgPath of images) {
    parentPort?.postMessage({ type: "progress", event: "image-start", index, total: images.length });
    let success = false;
    let attempt = 0;

    while (!success && attempt < MAX_RETRIES) {
  await enforceGlobalRateLimit(MIN_DELAY_MS);
  await sleep(MIN_DELAY_MS + Math.floor(Math.random() * 500)); // jitter
  parentPort?.postMessage({ type: "progress", event: "attempt", attempt: attempt + 1, index });

      try {
        console.log(
          `[worker] calling OpenAI for 1 image (attempt ${attempt + 1})`
        );

        const dataUrl = await toCompressedDataUrl(imgPath);
        const content = [
          {
            type: "text",
            text:
              "Return a pure JSON array of concise captions, one string per image, same order. No extra text.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ];

        const body = {
          model: model || "gpt-4o-mini",
          messages: [{ role: "user", content }],
          temperature: 0.2,
        };

        const resp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        console.log(`[worker] OpenAI response status: ${resp.status}`);

        if (resp.status === 429 || resp.status >= 500) {
          const retryAfter = resp.headers.get("retry-after");
          let delay = Math.max(BASE_BACKOFF_MS * 2 ** attempt, 30000); // ensure at least 30s wait
          if (retryAfter) {
            const secs = Number(retryAfter);
            if (!Number.isNaN(secs) && secs > 0) delay = secs * 1000;
          }
          console.warn(`[worker] 429: backing off for ${delay}ms`);
          parentPort?.postMessage({ type: "progress", event: "backoff", delay, index });
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(`OpenAI error (${resp.status}): ${text}`);
        }

        const data = await resp.json();
        const out = data.choices?.[0]?.message?.content?.trim() || "";
        const parsed = tryParseCaptions(out);
        results.push(parsed?.[0] || out);
        success = true;
      } catch (err) {
        attempt++;
        console.error(`[worker] error on attempt ${attempt}:`, err.message);
        const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
        parentPort?.postMessage({ type: "progress", event: "backoff", delay, index });
        await sleep(delay);
      }
    }

    if (!success) {
      results.push("");
      console.warn(`[worker] failed to caption image after ${MAX_RETRIES} retries`);
    }
    parentPort?.postMessage({ type: "progress", event: "image-done", index, total: images.length });
    index++;
  }

  return results;
}

parentPort?.on("message", async (msg) => {
  const { images, apiKey, model, jobId } = msg || {};
  try {
    console.log(`[worker] received ${images?.length || 0} images`);

    const captions = await captionBatch({ images, apiKey, model });

    // Optionally: update ImageJob progress (if using Prisma here)
    // await prisma.imageJob.update({
    //   where: { id: jobId },
    //   data: { processed: { increment: images.length } },
    // });

    parentPort?.postMessage({ ok: true, captions });
  } catch (err) {
    console.error("[worker] fatal error:", err?.message || err);
    parentPort?.postMessage({ ok: false, error: err?.message || String(err) });
  }
});
