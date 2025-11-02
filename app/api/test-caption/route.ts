import { NextResponse } from "next/server";
import sharp from "sharp";

async function toBase64DataUrl(filePath: string) {
  const image = sharp(filePath).rotate().resize(800);
  const buf = await image.jpeg({ quality: 70 }).toBuffer();
  const base64 = buf.toString("base64");
  return `data:image/jpeg;base64,${base64}`;
}

export async function POST(req: Request) {
  try {
    const text = await req.text();
    const body = JSON.parse(text);
    const { imagePath, model } = body;

    const apiKey = process.env.OPENAI_API_KEY!;
    const dataUrl = await toBase64DataUrl(imagePath);

    const payload = {
      model: model || "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image in one short caption." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    };

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    return NextResponse.json({ ok: true, caption: data.choices?.[0]?.message?.content });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err.message });
  }
}
