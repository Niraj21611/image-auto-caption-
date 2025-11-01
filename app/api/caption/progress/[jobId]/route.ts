import { NextResponse } from "next/server";
import { getProgress } from "@/lib/actions/caption.actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const url = new URL(req.url);
    const dirPath = url.searchParams.get("dirPath") || undefined;
    const res = await getProgress(jobId, dirPath);
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
