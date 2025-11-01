// ESM Worker: compress images with sharp, call OpenAI Vision for a small batch, return captions
import { parentPort } from 'node:worker_threads';
import sharp from 'sharp';

async function toCompressedDataUrl(filePath) {
  const image = sharp(filePath).rotate();
  const meta = await image.metadata();
  const width = meta.width || 0;
  const pipe = width > 1200 ? image.resize(1200) : image;
  // Encode to JPEG for consistent size
  const buf = await pipe.jpeg({ quality: 80 }).toBuffer();
  const base64 = buf.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
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
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
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
    const captions = await captionBatch({ images, apiKey, model });
    parentPort?.postMessage({ ok: true, captions });
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: err?.message || String(err) });
  }
});
