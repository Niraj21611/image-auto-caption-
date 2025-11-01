import { NextResponse } from "next/server";
import { getProgress } from "@/lib/actions/caption.actions";

export async function GET(
  _req: Request,
  context: { params: { jobId: string } }
) {
  try {
    const { jobId } = context.params;
    const res = await getProgress(jobId);
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
