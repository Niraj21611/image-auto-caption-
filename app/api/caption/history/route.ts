import { NextResponse } from "next/server";
import { getHistory } from "@/lib/actions/caption.actions";

export async function GET() {
  try {
    const res = await getHistory(50);
    return NextResponse.json(res, { status: res.success ? 200 : 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
