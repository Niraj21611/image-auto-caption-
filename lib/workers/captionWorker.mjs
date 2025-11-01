// ESM Worker: compress images with sharp, call OpenAI Vision for a small batch, return captions
import { parentPort } from 'node:worker_threads';
import sharp from 'sharp';
import * as fsp from 'node:fs/promises';
import path from 'node:path';

// Ensure fetch exists in worker (Node <20 worker contexts may not have global fetch consistently)
if (typeof fetch !== 'function') {
  try {
    const undici = await import('undici');
  // @ts-expect-error dynamic import shape differences across versions
    globalThis.fetch = undici.fetch || undici.default?.fetch || globalThis.fetch;
  } catch {
    // leave as-is; subsequent fetch usage will throw a descriptive error
  }
}

function mimeFromExt(ext) {
  switch (ext.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function toCompressedDataUrl(filePath) {
  try {
    const image = sharp(filePath).rotate();
    const meta = await image.metadata();
    const width = meta.width || 0;
    const pipe = width > 1200 ? image.resize(1200) : image;
    // Encode to JPEG for consistent size
    const buf = await pipe.jpeg({ quality: 80 }).toBuffer();
    const base64 = buf.toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    // Fallback: use original file bytes
    try {
      const buf = await fsp.readFile(filePath);
      const ext = path.extname(filePath);
      const mime = mimeFromExt(ext);
      const base64 = buf.toString('base64');
      return `data:${mime};base64,${base64}`;
    } catch (e2) {
      throw e2;
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function tryParseCaptions(raw) {
  let text = String(raw || '').trim();
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
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !s.startsWith('```') && s.toLowerCase() !== 'json' && s !== '[' && s !== ']');
  return lines.length ? lines : null;
}

async function captionBatch({ images, apiKey, model }) {
  // Basic guardrails
  if (!apiKey) throw new Error('Missing OpenAI API key in worker');
  const content = [
    {
      type: 'text',
      text: 'Return a pure JSON array of concise captions, one string per image, same order. No extra text.',
    },
  ];
  for (const p of images) {
    const dataUrl = await toCompressedDataUrl(p);
    content.push({ type: 'image_url', image_url: { url: dataUrl } });
  }

  const body = {
    model: model || 'gpt-4o-mini',
    messages: [{ role: 'user', content }],
    temperature: 0.2,
  };

  let attempt = 0;
  while (true) {
    if (typeof fetch !== 'function') {
      throw new Error('Fetch is not available in worker; ensure Node 18+ or set global fetch via undici.');
    }
    // Debug: mark that we're about to call OpenAI
    try { console.log(`[worker] calling OpenAI for ${images.length} images with model ${body.model}`); } catch {}
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    try { console.log(`[worker] OpenAI response status: ${resp} ${resp.status}`); } catch {}
    if (resp.status === 429 || resp.status >= 500) {
      if (attempt < 8) {
        let delay = Math.min(8000, 800 * 2 ** attempt) + Math.random() * 300;
        try {
          // Try to parse suggested retry wait from body text
          const text = await resp.clone().text();
          const m = text.match(/try again in\s+([0-9]+\.?[0-9]*)s/i);
          if (m && m[1]) {
            const seconds = parseFloat(m[1]);
            if (!isNaN(seconds)) delay = Math.max(delay, Math.ceil(seconds * 1000));
          }
        } catch {}
        await sleep(delay);
        attempt++;
        continue;
      }
    }
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OpenAI error (${resp.status}): ${text}`);
    }
    const data = await resp.json();
    const out = data.choices?.[0]?.message?.content?.trim() || '';
    const parsed = tryParseCaptions(out);
    if (parsed) return parsed;
    return [out];
  }
}

parentPort?.on('message', async (msg) => {
  const { images, apiKey, model } = msg || {};
  try {
    try { console.log(`[worker] received batch of ${Array.isArray(images) ? images.length : 0} images`); } catch {}
    const captions = await captionBatch({ images, apiKey, model });
    parentPort?.postMessage({ ok: true, captions });
  } catch (err) {
    try { console.error('[worker] error:', err?.message || String(err)); } catch {}
    parentPort?.postMessage({ ok: false, error: err?.message || String(err) });
  }
});
