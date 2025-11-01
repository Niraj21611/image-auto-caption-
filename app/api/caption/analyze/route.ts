import { NextResponse } from "next/server";
import { analyzeDirectory } from "@/lib/actions/caption.actions";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const dirPath = body?.dirPath as string | undefined;
    const res = await analyzeDirectory(dirPath || "");
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
