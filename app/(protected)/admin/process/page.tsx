"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FolderSearch, Play, History, Sparkles, CheckCircle2, XCircle, Loader2, FolderOpen } from "lucide-react";

type AnalyzeResponse = { success: true; jobId: string; count: number } | { success: false; error: string };
type StartResponse = { success: true; started: boolean } | { success: false; error: string };
type ProgressResponse =
  | {
      success: true;
      job: {
        status: "idle" | "running" | "completed" | "failed" | "cancelled";
        total: number;
        processed: number;
        dirPath: string;
        startedAt?: number;
        finishedAt?: number;
        error?: string;
      };
    }
  | { success: false; error: string };
type HistoryResponse = { success: true; data: { dirPath: string; count: number }[] } | { success: false; error: string };

export default function ProcessPage() {
  const [dirPath, setDirPath] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState<number | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number; status: string; error?: string } | null>(
    null
  );
  const [history, setHistory] = useState<{ dirPath: string; count: number }[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pct = useMemo(() => {
    if (!progress || progress.total === 0) return 0;
    return Math.floor((progress.processed / progress.total) * 100);
  }, [progress]);

  const fetchHistory = useCallback(async () => {
    const res = await fetch("/api/caption/history", { cache: "no-store" });
    const data: HistoryResponse = await res.json();
    if (data.success) setHistory(data.data);
  }, []);

  const handleBrowseDirectory = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      if (relativePath) {
        // Extract directory path by removing the filename
        const lastSlashIndex = relativePath.lastIndexOf("/");
        const dirPath = relativePath.substring(0, lastSlashIndex > -1 ? lastSlashIndex : 0);
        if (dirPath) {
          setDirPath(dirPath);
        }
      }
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const analyze = async () => {
    if (!dirPath) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/caption/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dirPath }),
      });
      const data: AnalyzeResponse = await res.json();
      if (data.success) {
        setJobId(data.jobId);
        setImageCount(data.count);
        setProgress({ processed: 0, total: data.count, status: "idle" });
      } else {
        alert(`Analyze error: ${data.error}`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const start = async () => {
    if (!jobId) return;
    setIsStarting(true);
    try {
      const res = await fetch("/api/caption/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data: StartResponse = await res.json();
      if (!data.success) {
        alert(`Start error: ${"error" in data ? data.error : "Unknown"}`);
        return;
      }
      // Start polling
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const resp = await fetch(`/api/caption/progress/${jobId}`, { cache: "no-store" });
        const payload: ProgressResponse = await resp.json();
        if (payload.success) {
          const j = payload.job;
          setProgress({ processed: j.processed, total: j.total, status: j.status, error: j.error });
          if (j.status === "completed" || j.status === "failed" || j.status === "cancelled") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            fetchHistory();
          }
        }
      }, 1500);
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && jobId) {
        fetch(`/api/caption/progress/${jobId}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((payload: ProgressResponse) => {
            if (payload.success) {
              const j = payload.job;
              setProgress({ processed: j.processed, total: j.total, status: j.status, error: j.error });
            }
          });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [jobId]);

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
              <h1 className="text-lg font-semibold text-foreground">
                Image Caption Processor
              </h1>
              <p className="text-sm text-muted-foreground">
                Batch-generate AI captions for your images
              </p>
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
              <h3 className="text-sm font-semibold text-purple-900">Directory Analysis</h3>
              <p className="text-xs text-purple-700 mt-0.5">
                Select a local directory containing images (jpg, jpeg, png)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Directory Path</label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. C:\Users\you\Pictures\album"
                  value={dirPath}
                  onChange={(e) => setDirPath(e.target.value)}
                  className="h-11 bg-white border-purple-200 focus:border-purple-500 focus:ring-purple-500"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  style={{ display: "none" }}
                  // @ts-expect-error - webkitdirectory is not in standard TypeScript types
                  webkitdirectory=""
                  directory=""
                  multiple
                />
                <Button
                  onClick={handleBrowseDirectory}
                  variant="outline"
                  className="h-11 px-4 border-purple-300 hover:bg-purple-50 hover:border-purple-400 shrink-0"
                  type="button"
                >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button 
              onClick={analyze} 
              disabled={!dirPath || isAnalyzing}
              className="h-11 bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <FolderSearch className="w-4 h-4" />
                  Analyze
                </>
              )}
            </Button>
            <Button 
              onClick={start} 
              disabled={!jobId || isStarting}
              className="h-11 bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Processing
                </>
              )}
            </Button>
          </div>
        </div>

        {imageCount !== null && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-linear-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-900 uppercase tracking-wide">Images Detected</p>
                  <p className="text-3xl font-bold text-blue-700 mt-1">{imageCount}</p>
                </div>
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-blue-600" />
                </div>
              </div>
            </div>

            {progress && (
              <div className={`bg-linear-to-br rounded-xl p-6 border shadow-sm ${
                progress.status === 'completed' 
                  ? 'from-green-50 to-emerald-50 border-green-200'
                  : progress.status === 'failed'
                  ? 'from-red-50 to-pink-50 border-red-200'
                  : progress.status === 'running'
                  ? 'from-orange-50 to-amber-50 border-orange-200'
                  : 'from-gray-50 to-slate-50 border-gray-200'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide flex items-center gap-2">
                      {progress.status === 'completed' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-green-900">Completed</span>
                        </>
                      ) : progress.status === 'failed' ? (
                        <>
                          <XCircle className="w-4 h-4 text-red-600" />
                          <span className="text-red-900">Failed</span>
                        </>
                      ) : progress.status === 'running' ? (
                        <>
                          <Loader2 className="w-4 h-4 text-orange-600 animate-spin" />
                          <span className="text-orange-900">Processing</span>
                        </>
                      ) : (
                        <span className="text-gray-900">Idle</span>
                      )}
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${
                      progress.status === 'completed' ? 'text-green-700'
                      : progress.status === 'failed' ? 'text-red-700'
                      : progress.status === 'running' ? 'text-orange-700'
                      : 'text-gray-700'
                    }`}>
                      {progress.processed}/{progress.total}
                    </p>
                  </div>
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${
                    progress.status === 'completed' ? 'bg-green-100 text-green-700'
                    : progress.status === 'failed' ? 'bg-red-100 text-red-700'
                    : progress.status === 'running' ? 'bg-orange-100 text-orange-700'
                    : 'bg-gray-100 text-gray-700'
                  }`}>
                    {pct}%
                  </div>
                </div>
                <div className="space-y-2">
                  <div className={`h-2.5 w-full rounded-full ${
                    progress.status === 'completed' ? 'bg-green-100'
                    : progress.status === 'failed' ? 'bg-red-100'
                    : progress.status === 'running' ? 'bg-orange-100'
                    : 'bg-gray-100'
                  }`}>
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        progress.status === 'completed' ? 'bg-green-600'
                        : progress.status === 'failed' ? 'bg-red-600'
                        : progress.status === 'running' ? 'bg-orange-600'
                        : 'bg-gray-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {progress.error && (
                    <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 p-2 rounded-lg border border-red-200">
                      <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{progress.error}</span>
                    </div>
                  )}
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
                  <TableHead className="font-semibold text-gray-700 w-32 text-right py-3 px-6">Images</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={2} className="py-12 px-6">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                          <History className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-900">No processing history yet</p>
                        <p className="text-xs text-gray-500 mt-1">Start analyzing directories to see history here</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((h) => (
                    <TableRow 
                      key={`${h.dirPath}-${h.count}`}
                      className="hover:bg-blue-50/50 transition-colors"
                    >
                      <TableCell className="font-mono text-xs sm:text-sm break-all py-4 px-6 text-gray-700">
                        {h.dirPath}
                      </TableCell>
                      <TableCell className="text-right py-4 px-6">
                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          {h.count}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
