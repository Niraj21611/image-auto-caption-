import Link from "next/link";
import HeaderCheckInOut from "@/components/Header/HeaderCheckInOut";

interface BatchSummary {
  id: string;
  dirPath: string;
  available: number;
  underReview: number;
}

interface BatchHeaderProps {
  summaries: BatchSummary[];
  selectedJobId: string;
  userId: string;
}

export default function BatchHeader({ summaries, selectedJobId, userId }: BatchHeaderProps) {
  return (
    <div className="sticky top-0 z-40 bg-white border-b border-border shadow-sm">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold text-foreground whitespace-nowrap">
            Your Assigned Batches
          </h1>

          <div className="flex items-center gap-3">
            <HeaderCheckInOut userId={userId} />
            
            <div className="flex items-center gap-2 overflow-x-auto">
              {summaries.map((s) => (
                <Link
                  key={s.id}
                  href={`/user/review?jobId=${s.id}`}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all whitespace-nowrap ${
                    s.id === selectedJobId
                      ? "bg-blue-600 text-white border-blue-600 shadow-md"
                      : "bg-white text-neutral-800 border-neutral-200 hover:border-blue-400 hover:shadow-sm"
                  }`}
                >
                  <span className="font-semibold">
                    {s.dirPath.split(/[\\/]/).pop() || s.dirPath}
                  </span>
                  <span className="text-xs opacity-90 bg-white/20 px-2 py-0.5 rounded">
                    {s.available} avail
                  </span>
                  <span className="text-xs opacity-90 bg-white/20 px-2 py-0.5 rounded">
                    {s.underReview} reviewed
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
