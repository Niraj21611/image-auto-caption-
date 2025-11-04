import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json(
        { error: "Missing path parameter" },
        { status: 400 }
      );
    }

    const normalizedPath = path.normalize(filePath);

    if (!fs.existsSync(normalizedPath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(normalizedPath).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : "application/octet-stream";

    const fileBuffer = fs.readFileSync(normalizedPath);

    return new NextResponse(fileBuffer, {
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    console.error("Error serving file:", err);
    return NextResponse.json({ error: "Error serving file" }, { status: 500 });
  }
}
