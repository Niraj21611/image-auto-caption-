"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FolderSearch,
  History,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  HelpCircle,
  Send,
} from "lucide-react";
import {
  getHistory as getHistoryAction,
  prepareAndUpload,
  createCaptionBatch,
  pollBatchAndIngest,
} from "@/lib/actions/caption.actions";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type HistoryRow = {
  jobId: string;
  dirPath: string;
  status: string;
  processed: number;
  total: number;
  createdAt: string;
};

export default function ProcessPage() {
  const [dirPath, setDirPath] = useState("");
  const [prompt, setPrompt] = useState("Write a concise, descriptive caption for this image.");
  const [jobId, setJobId] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number; status: string } | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pct = useMemo(() => {
    if (!progress || progress.total === 0) return 0;
    return Math.floor((progress.processed / progress.total) * 100);
  }, [progress]);

  const fetchHistory = useCallback(async () => {
    const data = await getHistoryAction(50);
    if (data.success) setHistory(data.data as HistoryRow[]);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const prepare = async () => {
    if (!dirPath) return;
    setIsPreparing(true);
    try {
      const res = await prepareAndUpload(dirPath);
      if (res.success && res.data) {
        setJobId(res.data.jobId);
        setImageCount(res.data.total);
        setProgress({ processed: 0, total: res.data.total, status: "READY" });
      } else {
        alert(res.error || "Failed to prepare job");
      }
    } finally {
      setIsPreparing(false);
    }
  };

  const submit = async () => {
    if (!jobId) return;
    setIsSubmitting(true);
    try {
      const res = await createCaptionBatch(jobId, prompt);
      if (!res.success) {
        alert(res.error || "Failed to create batch");
        return;
      }
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const pr = await pollBatchAndIngest(jobId);
        if (pr.success && pr.data) {
          setProgress({ processed: pr.data.processed ?? 0, total: pr.data.total ?? 0, status: pr.data.status });
          if (pr.data.status === "completed" || pr.data.status === "failed" || pr.data.status === "cancelled") {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            await fetchHistory();
          }
        }
      }, 2000);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">Image Caption Processor</h1>
              <p className="text-sm text-muted-foreground">Upload images to OpenAI, create a batch, and ingest results automatically</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 space-y-6">
        <div className="bg-linear-to-br from-purple-50 via-blue-50 to-indigo-50 rounded-xl p-6 border border-purple-200 shadow-sm">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <FolderSearch className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-purple-900">Directory & Prompt</h3>
              <p className="text-xs text-purple-700 mt-0.5">Select a local directory containing images (jpg, jpeg, png, webp)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr]">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Directory Path</label>
              <Input placeholder="e.g. C:\\Users\\you\\Pictures\\album" value={dirPath} onChange={(e) => setDirPath(e.target.value)} className="h-11 bg-white border-purple-200 focus:border-purple-500 focus:ring-purple-500" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <label className="text-xs font-medium text-gray-700">Caption Prompt</label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-gray-500 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs"><p className="text-xs">Prompt given to the model for each image in the batch.</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-24 p-3 rounded-md border bg-white border-purple-200 focus:border-purple-500 focus:ring-purple-500 outline-none" />
            </div>
            <div className="flex gap-3">
              <Button onClick={prepare} disabled={!dirPath || isPreparing} className="h-11 bg-purple-600 hover:bg-purple-700 text-white gap-2">
                {isPreparing ? (<><Loader2 className="w-4 h-4 animate-spin" /> Preparing...</>) : (<><FolderSearch className="w-4 h-4" /> Prepare</>)}
              </Button>
              <Button onClick={submit} disabled={!jobId || isSubmitting} className="h-11 bg-green-600 hover:bg-green-700 text-white gap-2">
                {isSubmitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>) : (<><Send className="w-4 h-4" /> Create Batch</>)}
              </Button>
            </div>
          </div>
        </div>

        {imageCount !== null && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-linear-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">Images Found</p>
                  <p className="text-3xl font-bold text-blue-700 mt-1">{imageCount}</p>
                </div>
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-blue-600" />
                </div>
              </div>
            </div>

            {progress && (
              <div className={`bg-linear-to-br rounded-xl p-6 border shadow-sm ${progress.status === "completed" ? "from-green-50 to-emerald-50 border-green-200" : progress.status === "failed" ? "from-red-50 to-pink-50 border-red-200" : progress.status === "BATCH_SUBMITTED" || progress.status === "in_progress" || progress.status === "READY" ? "from-orange-50 to-amber-50 border-orange-200" : "from-gray-50 to-slate-50 border-gray-200"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide flex items-center gap-2">
                      {progress.status === "completed" ? (
                        <><CheckCircle2 className="w-4 h-4 text-green-600" /><span className="text-green-900">Completed</span></>
                      ) : progress.status === "failed" ? (
                        <><XCircle className="w-4 h-4 text-red-600" /><span className="text-red-900">Failed</span></>
                      ) : (
                        <><Loader2 className="w-4 h-4 text-orange-600 animate-spin" /><span className="text-orange-900">Processing</span></>
                      )}
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${progress.status === "completed" ? "text-green-700" : progress.status === "failed" ? "text-red-700" : "text-orange-700"}`}>
                      {progress.processed}/{progress.total}
                    </p>
                  </div>
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${progress.status === "completed" ? "bg-green-100 text-green-700" : progress.status === "failed" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                    {pct}%
                  </div>
                </div>
                <div className="space-y-2">
                  <div className={`h-2.5 w-full rounded-full ${progress.status === "completed" ? "bg-green-100" : progress.status === "failed" ? "bg-red-100" : "bg-orange-100"}`}>
                    <div className={`h-2.5 rounded-full transition-all duration-500 ${progress.status === "completed" ? "bg-green-600" : progress.status === "failed" ? "bg-red-600" : "bg-orange-600"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-linear-to-r from-gray-50 to-slate-50">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-gray-600" />
              <h3 className="text-sm font-semibold text-gray-900">Processing History</h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 hover:bg-gray-50">
                  <TableHead className="font-semibold text-gray-700 py-3 px-6">Directory Path</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-28 text-center py-3 px-6">Status</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-40 text-center py-3 px-6">Progress</TableHead>
                  <TableHead className="font-semibold text-gray-700 w-48 text-right py-3 px-6">Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="py-12 px-6">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3"><History className="w-8 h-8 text-gray-400" /></div>
                        <p className="text-sm font-medium text-gray-900">No processing history yet</p>
                        <p className="text-xs text-gray-500 mt-1">Start preparing a batch to see history here</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((h) => {
                    const processedDate = new Date(h.createdAt);
                    const now = new Date();
                    const diffMs = now.getTime() - processedDate.getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMins / 60);
                    const diffDays = Math.floor(diffHours / 24);

                    let timeAgo = "";
                    if (diffDays > 0) timeAgo = `${diffDays}d ago`;
                    else if (diffHours > 0) timeAgo = `${diffHours}h ago`;
                    else if (diffMins > 0) timeAgo = `${diffMins}m ago`;
                    else timeAgo = "Just now";

                    return (
                      <TableRow key={`${h.jobId}`} className="hover:bg-blue-50/50 transition-colors">
                        <TableCell className="font-mono text-xs sm:text-sm break-all py-4 px-6 text-gray-700">{h.dirPath}</TableCell>
                        <TableCell className="text-center py-4 px-6">
                          <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold
                            ${h.status === "COMPLETED" ? "bg-green-100 text-green-700" : h.status === "RUNNING" ? "bg-orange-100 text-orange-700" : h.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}
                          `}>
                            {h.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-center py-4 px-6">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">{h.processed}/{h.total}</span>
                        </TableCell>
                        <TableCell className="text-right py-4 px-6">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-medium text-gray-700">{timeAgo}</span>
                            <span className="text-xs text-gray-500">{processedDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
