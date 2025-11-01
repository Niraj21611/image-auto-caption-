// ESM Worker: compress images with sharp, call OpenAI Vision for a small batch, return captions
import { parentPort } from "node:worker_threads";
import sharp from "sharp";
import * as fsp from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Ensure fetch exists in worker (Node <20 worker contexts may not have global fetch consistently)
if (typeof fetch !== "function") {
  try {
    const undici = await import("undici");
    // @ts-expect-error dynamic import shape differences across versions
    globalThis.fetch =
      undici.fetch || undici.default?.fetch || globalThis.fetch;
  } catch {
    // leave as-is; subsequent fetch usage will throw a descriptive error
  }
}

function getEnvInt(name, def) {
  const v = Number.parseInt(process.env?.[name] || "", 10);
  return Number.isFinite(v) && !Number.isNaN(v) ? v : def;
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
    const target = 800; // smaller side for lower bandwidth
    const pipe = width > target ? image.resize(target) : image;
    // Encode to JPEG for consistent size (lower quality to reduce payload)
    const buf = await pipe.jpeg({ quality: 70 }).toBuffer();
    const base64 = buf.toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    // Fallback: use original file bytes
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

// async function captionBatch({ images, apiKey, model, depth = 0 }) {
//   // Basic guardrails
//   if (!apiKey) throw new Error('Missing OpenAI API key in worker');
//   const MIN_DELAY_MS = getEnvInt('CAPTION_MIN_DELAY_MS', 5000);
//   const BASE_BACKOFF_MS = getEnvInt('CAPTION_BACKOFF_BASE_MS', 5000);
//   const MAX_BACKOFF_MS = getEnvInt('CAPTION_BACKOFF_MAX_MS', 60000);
//   const MAX_RETRIES = getEnvInt('CAPTION_MAX_RETRIES', 8);
//   const content = [
//     {
//       type: 'text',
//       text: 'Return a pure JSON array of concise captions, one string per image, same order. No extra text.',
//     },
//   ];
//   for (const p of images) {
//     const dataUrl = await toCompressedDataUrl(p);
//     content.push({ type: 'image_url', image_url: { url: dataUrl } });
//   }

//   const body = {
//     model: model || 'gpt-4o-mini',
//     messages: [{ role: 'user', content }],
//     temperature: 0.2,
//   };

//   let attempt = 0;
//   while (true) {
//     if (typeof fetch !== 'function') {
//       throw new Error('Fetch is not available in worker; ensure Node 18+ or set global fetch via undici.');
//     }
//     // Respect a minimum pacing between requests to avoid 429s
//     await sleep(MIN_DELAY_MS);
//     // Debug: mark that we're about to call OpenAI
//     try { console.log(`[worker] calling OpenAI for ${images.length} images with model ${body.model} (attempt ${attempt + 1})`); } catch {}
//     const resp = await fetch('https://api.openai.com/v1/chat/completions', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         Authorization: `Bearer ${apiKey}`,
//       },
//       body: JSON.stringify(body),
//     });
//     try { console.log(`[worker] OpenAI response status: ${resp.status}`); } catch {}
//     if (resp.status === 429 || resp.status >= 500) {
//       // Respect Retry-After and ratelimit headers if present
//       const retryAfter = resp.headers.get('retry-after');
//       const rlResetReq = resp.headers.get('x-ratelimit-reset-requests');
//       const rlRemaining = resp.headers.get('x-ratelimit-remaining-requests');
//       let delay = 0;
//       if (retryAfter) {
//         const secs = Number(retryAfter);
//         if (!Number.isNaN(secs) && secs > 0) delay = Math.max(delay, secs * 1000);
//       }
//       if (!delay && rlResetReq) {
//         const secs = Number(rlResetReq);
//         if (!Number.isNaN(secs) && secs > 0) delay = Math.max(delay, Math.ceil(secs * 1000));
//       }
//       const exp = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
//       delay = Math.max(delay, exp + Math.floor(Math.random() * Math.min(2000, exp * 0.25)));
//       if (rlRemaining === '0') delay = Math.max(delay, MAX_BACKOFF_MS);

//       if (attempt >= 2 && images.length > 1 && depth < 1) {
//         // Adaptive fallback: split into single-image requests
//         try { console.log('[worker] 429 persists; splitting batch into single-image requests'); } catch {}
//         const results = [];
//         for (const img of images) {
//           await sleep(Math.max(MIN_DELAY_MS, delay));
//           const sub = await captionBatch({ images: [img], apiKey, model, depth: depth + 1 });
//           results.push(sub[0] || '');
//         }
//         return results;
//       }
//       if (attempt < MAX_RETRIES) {
//         await sleep(delay);
//         attempt++;
//         continue;
//       }
//     }
//     if (!resp.ok) {
//       const text = await resp.text();
//       if (resp.status === 400 && /context|length|too large|maximum|tokens/i.test(text) && images.length > 1 && depth < 1) {
//         try { console.log('[worker] payload too large; splitting batch into single-image requests'); } catch {}
//         const results = [];
//         for (const img of images) {
//           const sub = await captionBatch({ images: [img], apiKey, model, depth: depth + 1 });
//           results.push(sub[0] || '');
//         }
//         return results;
//       }
//       throw new Error(`OpenAI error (${resp.status}): ${text}`);
//     }
//     const data = await resp.json();
//     const out = data.choices?.[0]?.message?.content?.trim() || '';
//     const parsed = tryParseCaptions(out);
//     if (parsed) return parsed;
//     return [out];
//   }
// }

async function captionBatch({ images, apiKey, model, depth = 0 }) {
  if (!apiKey) throw new Error("Missing OpenAI API key in worker");

  const client = new OpenAI({ apiKey });

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

  let attempt = 0;

  while (true) {
    try {
      console.log(
        `[worker] calling OpenAI SDK for ${images.length} images (attempt ${
          attempt + 1
        })`
      );

      const response = await client.chat.completions.create({
        model: model || "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content,
          },
        ],
        temperature: 0.2,
      });
      console.log("This is ", response)
      const out = response.choices?.[0]?.message?.content?.trim() || "";
      const parsed = tryParseCaptions(out);
      if (parsed) return parsed;
      return [out];
    } catch (err) {
      // Handle rate limits or transient errors
      if (
        err.status === 429 ||
        err.status >= 500 ||
        /rate limit/i.test(err.message)
      ) {
        const delay = 5000 * Math.pow(2, attempt);
        console.warn(`[worker] Rate-limited. Retrying in ${delay}ms`);
        await sleep(delay);
        attempt++;
        if (attempt > 5) throw err;
        continue;
      }
      throw err;
    }
  }
}

parentPort?.on("message", async (msg) => {
  const { images, apiKey, model } = msg || {};
  try {
    try {
      console.log(
        `[worker] received batch of ${
          Array.isArray(images) ? images.length : 0
        } images`
      );
    } catch {}
    const captions = await captionBatch({ images, apiKey, model });
    parentPort?.postMessage({ ok: true, captions });
  } catch (err) {
    try {
      console.error("[worker] error:", err?.message || String(err));
    } catch {}
    parentPort?.postMessage({ ok: false, error: err?.message || String(err) });
  }
});
