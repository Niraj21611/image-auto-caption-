import { NextResponse } from "next/server";
import { startProcessing } from "@/lib/actions/caption.actions";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
  const jobId = body?.jobId as string | undefined;
  const dirPath = body?.dirPath as string | undefined;
  const batchSize = typeof body?.batchSize === "number" ? body.batchSize : undefined;
  const concurrency = typeof body?.concurrency === "number" ? body.concurrency : undefined;
  const res = await startProcessing(jobId || "", batchSize, dirPath, concurrency);
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
