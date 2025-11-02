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

// Parse a variety of model outputs into an array of captions
function tryParseCaptions(raw) {
  let text = String(raw ?? "").trim();
  // Strip fenced code blocks
  const fence = /```[a-zA-Z]*\n?([\s\S]*?)```/g;
  text = text.replace(fence, (_, inner) => inner).trim();
  // Direct JSON parse
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr.map((s) => String(s));
  } catch {}
  // Try to extract JSON array substring
  const jsonArrayMatch = text.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    try {
      const arr = JSON.parse(jsonArrayMatch[0]);
      if (Array.isArray(arr)) return arr.map((s) => String(s));
    } catch {}
  }
  // Fallback: non-empty lines
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith("```") && s.toLowerCase() !== "json" && s !== "[" && s !== "]");
  return lines.length ? lines : [];
}

async function toCompressedDataUrl(filePath) {
  try {
    const image = sharp(filePath).rotate();
    const meta = await image.metadata();
    const width = meta.width || 0;
    const target = 800; // smaller side target
    const pipe = width > target ? image.resize(target) : image;
    const buf = await pipe.jpeg({ quality: 70 }).toBuffer();
    const base64 = buf.toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    // Fallback to original bytes
    const buf = await fsp.readFile(filePath);
    const ext = path.extname(filePath);
    const mime = mimeFromExt(ext);
    const base64 = buf.toString("base64");
    return `data:${mime};base64,${base64}`;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Optional global rate limiting between worker threads/processes
async function enforceGlobalRateLimit(minInterval = 0) {
  if (!minInterval) return;
  try {
    const now = Date.now();
    let last = 0;
    try {
      const raw = await fsp.readFile(GLOBAL_RATE_LIMIT_FILE, "utf8");
      last = Number(raw) || 0;
    } catch {}
    const delta = now - last;
    if (delta < minInterval) {
      await sleep(minInterval - delta + Math.random() * 200);
    }
    await fsp.writeFile(GLOBAL_RATE_LIMIT_FILE, String(Date.now()));
  } catch (err) {
    try { console.error("[worker] global rate limit error:", err); } catch {}
  }
}

async function captionBatch({ images, apiKey, model, depth = 0 }) {
  if (!apiKey) throw new Error("Missing OpenAI API key in worker");

  const MIN_DELAY_MS = getEnvInt("CAPTION_MIN_DELAY_MS", 1000);
  const BASE_BACKOFF_MS = getEnvInt("CAPTION_BACKOFF_BASE_MS", 3000);
  const MAX_BACKOFF_MS = getEnvInt("CAPTION_MAX_BACKOFF_MS", 60000);
  const MAX_RETRIES = getEnvInt("CAPTION_MAX_RETRIES", 6);
  const SPLIT_CONCURRENCY = Math.max(1, getEnvInt("CAPTION_SPLIT_CONCURRENCY", 3));
  const GLOBAL_MIN_INTERVAL_MS = getEnvInt("CAPTION_GLOBAL_RATE_LIMIT_MS", 0);

  parentPort?.postMessage({ type: "progress", event: "start", total: images.length });

  // Build content with all images (batch)
  const content = [
    {
      type: "text",
      text: "Return a pure JSON array of concise captions, one string per image, same order. No extra text.",
    },
  ];
  for (const p of images) {
    const dataUrl = await toCompressedDataUrl(p);
    content.push({ type: "image_url", image_url: { url: dataUrl } });
  }

  const body = {
    model: model || "gpt-4o-mini",
    messages: [{ role: "user", content }],
    temperature: 0.2,
  };

  let attempt = 0;
  while (true) {
    if (GLOBAL_MIN_INTERVAL_MS > 0) await enforceGlobalRateLimit(GLOBAL_MIN_INTERVAL_MS);
    await sleep(MIN_DELAY_MS + Math.floor(Math.random() * 250));
    parentPort?.postMessage({ type: "progress", event: "attempt", attempt: attempt + 1 });

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    try { console.log(`[worker] OpenAI response status: ${resp.status}`); } catch {}

    if (resp.status === 429 || resp.status >= 500) {
      const retryAfter = resp.headers.get("retry-after");
      let delay = Math.min(MAX_BACKOFF_MS, Math.max(BASE_BACKOFF_MS * 2 ** attempt, 2000));
      if (retryAfter) {
        const secs = Number(retryAfter);
        if (!Number.isNaN(secs) && secs > 0) delay = secs * 1000;
      }
      parentPort?.postMessage({ type: "progress", event: "backoff", delay });
      if (attempt >= 2 && images.length > 1 && depth < 2) {
        // Split into single-image requests with limited concurrency
        const results = new Array(images.length).fill("");
        let i = 0;
        const runOne = async () => {
          const my = i++;
          if (my >= images.length) return;
          try {
            const sub = await captionBatch({ images: [images[my]], apiKey, model, depth: depth + 1 });
            results[my] = sub[0] || "";
          } catch {
            results[my] = "";
          } finally {
            parentPort?.postMessage({ type: "progress", event: "split-progress", done: Math.min(my + 1, images.length), total: images.length });
            await runOne();
          }
        };
        const starters = Math.min(SPLIT_CONCURRENCY, images.length);
        await Promise.all(Array.from({ length: starters }, () => runOne()))
        return results;
      }
      if (attempt < MAX_RETRIES) {
        await sleep(delay);
        attempt++;
        continue;
      }
    }

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 400 && /context|length|too large|maximum|tokens/i.test(text) && images.length > 1 && depth < 2) {
        // Payload too large: split
        const results = [];
        for (const img of images) {
          const sub = await captionBatch({ images: [img], apiKey, model, depth: depth + 1 });
          results.push(sub[0] || "");
        }
        return results;
      }
      throw new Error(`OpenAI error (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    const out = data.choices?.[0]?.message?.content?.trim() || "";
    const parsed = tryParseCaptions(out) || [];
    if (parsed.length >= images.length) return parsed.slice(0, images.length);
    // Pad if model returned fewer captions
    while (parsed.length < images.length) parsed.push(parsed[parsed.length - 1] || "");
    return parsed;
  }
}

parentPort?.on("message", async (msg) => {
  const { images, apiKey, model } = msg || {};
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
