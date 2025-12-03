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
  Send,
  RotateCw,
} from "lucide-react";
import {
  getHistory as getHistoryAction,
  prepareAndUpload,
  createCaptionBatch,
  pollBatchAndIngest,
  getPreparationStatus,
  recreateFailedCaptionBatch,
  ingestBatchOutput,
  cancelPreparation,
  resumePreparation,
} from "@/lib/actions/caption.actions";
import { toast } from "sonner";

interface HistoryRow {
  jobId: string;
  dirPath: string;
  status: string;
  processed: number;
  total: number;
  createdAt: string;
}

interface ProgressState {
  processed: number;
  total: number;
  status: string;
  failed?: number;
  etaSeconds?: number | null;
}

const DEFAULT_PROMPT = "Write a concise, descriptive caption for this image.";

function formatEta(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return null;
  if (seconds <= 0) return "moments";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins <= 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function normalizeStatus(status?: string | null) {
  if (!status) return "PROCESSING";
  const upper = status.toUpperCase();
  if (upper === "SUCCESSFUL") return "SUCCESSFUL"; // show distinct successful state
  if (upper.includes("PREPARING")) return "PREPARING";
  if (upper === "READY") return "READY";
  if (upper === "FAILED") return "FAILED";
  if (upper === "CANCELLED" || upper === "CANCELED") return "CANCELLED";
  if (upper === "COMPLETED") return "COMPLETED";
  if (upper === "BATCH_SUBMITTED") return "BATCH_SUBMITTED";
  if (
    upper === "RUNNING" ||
    upper === "IN_PROGRESS" ||
    upper === "PROCESSING" ||
    upper === "VALIDATING"
  ) {
    return "RUNNING";
  }
  return "PROCESSING";
}

export default function ProcessPage() {
  const [dirPath, setDirPath] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState<number | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  type HistoryFilter = "ALL" | "READY" | "COMPLETED" | "PREPARING" | "FAILED" | "RUNNING";
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("ALL");
  const [ingestingJobs, setIngestingJobs] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prepPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const statusKey = useMemo(() => normalizeStatus(progress?.status), [progress?.status]);

  const pct = useMemo(() => {
    if (!progress) return 0;
    if (statusKey === "READY" || statusKey === "COMPLETED") return 100;
    if (!progress.total) return 0;
    const ratio = progress.processed / progress.total;
    return Math.max(0, Math.min(100, Math.floor(ratio * 100)));
  }, [progress, statusKey]);

  const statusClasses = useMemo(() => {
    switch (statusKey) {
      case "READY":
        return {
          card: "from-green-50 to-emerald-50 border-green-200",
          meterBg: "bg-green-100",
          meterFill: "bg-green-600",
          text: "text-green-900",
          badge: "bg-green-100 text-green-800",
        };
      case "FAILED":
        return {
          card: "from-rose-50 to-red-50 border-rose-200",
          meterBg: "bg-rose-100",
          meterFill: "bg-rose-600",
          text: "text-rose-900",
          badge: "bg-rose-100 text-rose-800",
        };
      case "COMPLETED":
        return {
          card: "from-emerald-50 to-green-50 border-emerald-200",
          meterBg: "bg-emerald-100",
          meterFill: "bg-emerald-600",
          text: "text-emerald-900",
          badge: "bg-emerald-100 text-emerald-800",
        };
      case "SUCCESSFUL":
        return {
          card: "from-teal-50 to-green-50 border-teal-200",
          meterBg: "bg-teal-100",
          meterFill: "bg-teal-600",
          text: "text-teal-900",
          badge: "bg-teal-100 text-teal-800",
        };
      case "CANCELLED":
        return {
          card: "from-gray-50 to-slate-50 border-gray-200",
          meterBg: "bg-gray-100",
          meterFill: "bg-gray-400",
          text: "text-gray-900",
          badge: "bg-gray-100 text-gray-800",
        };
      case "BATCH_SUBMITTED":
        return {
          card: "from-sky-50 to-blue-50 border-sky-200",
          meterBg: "bg-sky-100",
          meterFill: "bg-sky-500",
          text: "text-sky-900",
          badge: "bg-sky-100 text-sky-800",
        };
      case "RUNNING":
        return {
          card: "from-amber-50 to-orange-50 border-amber-200",
          meterBg: "bg-amber-100",
          meterFill: "bg-amber-500",
          text: "text-amber-900",
          badge: "bg-amber-100 text-amber-800",
        };
      case "PREPARING":
      default:
        return {
          card: "from-amber-50 to-orange-50 border-amber-200",
          meterBg: "bg-amber-100",
          meterFill: "bg-amber-500",
          text: "text-amber-900",
          badge: "bg-amber-100 text-amber-800",
        };
    }
  }, [statusKey]);

  const statusLabel = useMemo(() => {
    switch (statusKey) {
      case "READY":
        return "Batch prepared";
      case "FAILED":
        return "Failed";
      case "COMPLETED":
        return "Completed";
      case "SUCCESSFUL":
        return "Ingested";
      case "CANCELLED":
        return "Cancelled";
      case "BATCH_SUBMITTED":
        return "Batch submitted";
      case "RUNNING":
        return "Processing";
      case "PREPARING":
        return "Preparing";
      default:
        return "Processing";
    }
  }, [statusKey]);

  const progressMessage = useMemo(() => {
    switch (statusKey) {
      case "PREPARING":
        return "Uploading images to OpenAI. You can navigate away—uploads continue in the background.";
      case "READY":
        return "Uploads finished. Create the OpenAI batch to start captioning.";
      case "FAILED":
        return "Batch failed. You can attempt to recreate a batch for failed images.";
      case "BATCH_SUBMITTED":
        return "Batch sent to OpenAI. Waiting for completion.";
      case "RUNNING":
        return "OpenAI is generating captions. We'll ingest them as soon as they're ready.";
      case "COMPLETED":
        return "Batch finished. Manual ingestion may still be pending.";
      case "SUCCESSFUL":
        return "Output file ingested. Captions populated.";
      case "CANCELLED":
        return "Preparation was cancelled. You can resume to continue uploading remaining images.";
      default:
        return "Processing batch.";
    }
  }, [statusKey]);

  const etaLabel = useMemo(() => {
    if (statusKey !== "PREPARING") return null;
    return formatEta(progress?.etaSeconds);
  }, [statusKey, progress?.etaSeconds]);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await getHistoryAction(50);
      if (data.success && data.data) {
        setHistory(data.data as HistoryRow[]);
      } else if (!data.success) {
        toast.error(data.error || "Failed to load history");
      }
    } catch (err) {
      console.error("Error fetching history", err);
      toast.error("Unable to load history");
    }
  }, []);

  const filteredHistory = useMemo(() => {
    if (historyFilter === "ALL") return history;
    return history.filter((h) => normalizeStatus(h.status) === historyFilter);
  }, [history, historyFilter]);

  const handleHistoryRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchHistory();
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchHistory]);

  const stopPrepWatcher = useCallback(() => {
    if (prepPollRef.current) {
      clearInterval(prepPollRef.current);
      prepPollRef.current = null;
    }
  }, []);

  const stopBatchPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPreparationWatcher = useCallback(
    (targetJobId: string, totalHint: number) => {
      if (!targetJobId) return;
      stopPrepWatcher();
      prepPollRef.current = setInterval(() => {
        void (async () => {
          const res = await getPreparationStatus(targetJobId);
          if (res.success && res.data) {
            setProgress((prev) => ({
              processed: res.data.uploaded ?? prev?.processed ?? 0,
              total: res.data.total ?? prev?.total ?? totalHint,
              status: res.data.status,
              failed: res.data.failed ?? prev?.failed ?? 0,
              etaSeconds: res.data.etaSeconds ?? null,
            }));
            if (res.data.status === "READY" || res.data.status === "FAILED") {
              stopPrepWatcher();
            }
          }
        })();
      }, 1500);
    },
    [stopPrepWatcher]
  );

  const startBatchPolling = useCallback(
    (currentJobId: string) => {
      if (!currentJobId) return;
      stopBatchPolling();
      pollRef.current = setInterval(() => {
        void (async () => {
          const res = await pollBatchAndIngest(currentJobId);
          if (res.success && res.data) {
            setProgress((prev) => ({
              processed: res.data.processed ?? prev?.processed ?? 0,
              total: res.data.total ?? prev?.total ?? 0,
              failed: res.data.failed ?? prev?.failed ?? 0,
              status: res.data.status,
            }));
            const terminal = ["COMPLETED", "FAILED"].includes(
              (res.data.status || "").toUpperCase()
            );
            if (terminal) {
              stopBatchPolling();
              await fetchHistory();
            }
          } else if (!res.success && res.error) {
            console.error("pollBatchAndIngest error", res.error);
          }
        })();
      }, 4000);
    },
    [fetchHistory, stopBatchPolling]
  );

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    return () => {
      stopBatchPolling();
      stopPrepWatcher();
    };
  }, [stopBatchPolling, stopPrepWatcher]);

  const prepare = async () => {
    const pathToUse = dirPath.trim();
    if (!pathToUse) {
      toast.error("Directory path is required");
      return;
    }
    setIsPreparing(true);
    try {
      const res = await prepareAndUpload(pathToUse);
      if (!res.success || !res.data?.jobId) {
        toast.error(res.error || "Failed to prepare job");
        return;
      }
      stopBatchPolling();
      const { jobId: newJobId, total } = res.data;
      setJobId(newJobId);
      setImageCount(total);
      setProgress({
        processed: 0,
        total,
        status: "PREPARING",
        failed: 0,
        etaSeconds: null,
      });
      startPreparationWatcher(newJobId, total);
      toast.success("Uploading images in the background");
      await fetchHistory();
    } catch (err) {
      console.error("prepareAndUpload error", err);
      toast.error("Failed to prepare directory");
    } finally {
      setIsPreparing(false);
    }
  };

  const submit = async () => {
    if (!jobId) {
      toast.error("Prepare a directory first");
      return;
    }
    if (statusKey !== "READY") {
      toast.error("Wait for preparation to finish before creating a batch");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await createCaptionBatch(jobId, DEFAULT_PROMPT);
      if (!res.success || !res.data?.batchId) {
        toast.error(res.error || "Failed to create batch");
        return;
      }
      toast.success("Batch submitted to OpenAI");
      setProgress((prev) => ({
        processed: prev?.processed ?? 0,
        total: prev?.total ?? imageCount ?? 0,
        failed: prev?.failed ?? 0,
        status: "BATCH_SUBMITTED",
        etaSeconds: null,
      }));
      startBatchPolling(jobId);
      await fetchHistory();
    } catch (err) {
      console.error("createCaptionBatch error", err);
      toast.error("Failed to create batch");
    } finally {
      setIsSubmitting(false);
    }
  };

  const recreate = async () => {
    if (!jobId) {
      toast.error("No job to recreate");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await recreateFailedCaptionBatch(jobId, DEFAULT_PROMPT);
      if (!res.success || !res.data?.batchId) {
        toast.error(res.error || "Failed to recreate batch");
        return;
      }
      toast.success("Retry batch submitted to OpenAI");
      setProgress((prev) => ({
        processed: prev?.processed ?? 0,
        total: prev?.total ?? imageCount ?? 0,
        failed: 0,
        status: "BATCH_SUBMITTED",
        etaSeconds: null,
      }));
      startBatchPolling(jobId);
      await fetchHistory();
    } catch (err) {
      console.error("recreateFailedCaptionBatch error", err);
      toast.error("Failed to recreate batch");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cancelPrep = async () => {
    if (!jobId) {
      toast.error("No job in progress to cancel");
      return;
    }
    try {
      const res = await cancelPreparation(jobId);
      if (!res.success) {
        toast.error(res.error || "Failed to cancel preparation");
        return;
      }
      stopPrepWatcher();
      setProgress((prev) => ({
        processed: prev?.processed ?? 0,
        total: prev?.total ?? imageCount ?? 0,
        failed: prev?.failed ?? 0,
        status: "CANCELLED",
        etaSeconds: null,
      }));
      toast.success("Preparation cancelled");
      await fetchHistory();
    } catch (err) {
      console.error("cancelPreparation error", err);
      toast.error("Failed to cancel preparation");
    }
  };

  const resumePrep = async (targetJobId?: string) => {
    const idToUse = targetJobId || jobId;
    if (!idToUse) {
      toast.error("No job to resume");
      return;
    }
    try {
      const res = await resumePreparation(idToUse);
      if (!res.success || !res.data) {
        toast.error(res.error || "Failed to resume preparation");
        return;
      }
      setJobId(idToUse);
      setImageCount(res.data.total ?? imageCount ?? null);
      setProgress((prev) => ({
        processed: prev?.processed ?? 0,
        total: res.data.total ?? prev?.total ?? 0,
        failed: 0,
        status: "PREPARING",
        etaSeconds: null,
      }));
      startPreparationWatcher(idToUse, res.data.total ?? 0);
      toast.success("Resumed preparation");
      await fetchHistory();
    } catch (err) {
      console.error("resumePreparation error", err);
      toast.error("Failed to resume preparation");
    }
  };

  const createFromHistory = async (targetJobId: string) => {
    if (!targetJobId) return;
    setIsSubmitting(true);
    try {
      const res = await createCaptionBatch(targetJobId, DEFAULT_PROMPT);
      if (!res.success || !res.data?.batchId) {
        toast.error(res.error || "Failed to create batch");
        return;
      }
      toast.success("Batch submitted to OpenAI");
      setJobId(targetJobId);
      // When triggered from history, switch status to submitted and start polling
      setProgress((prev) => ({
        processed: prev?.processed ?? 0,
        total: prev?.total ?? 0,
        failed: prev?.failed ?? 0,
        status: "BATCH_SUBMITTED",
        etaSeconds: null,
      }));
      startBatchPolling(targetJobId);
      await fetchHistory();
    } catch (err) {
      console.error("createCaptionBatch (history) error", err);
      toast.error("Failed to create batch");
    } finally {
      setIsSubmitting(false);
    }
  };

  const ingestOutput = async (targetJobId: string) => {
    setIngestingJobs((prev) => new Set(prev).add(targetJobId));
    try {
      const res = await ingestBatchOutput(targetJobId);
      if (!res.success) {
        toast.error(res.error || "Failed to ingest output file");
      } else {
        toast.success("Batch output ingested");
        await fetchHistory();
      }
    } catch (err) {
      console.error("ingestBatchOutput error", err);
      toast.error("Failed to ingest batch output");
    } finally {
      setIngestingJobs((prev) => {
        const next = new Set(prev);
        next.delete(targetJobId);
        return next;
      });
    }
  };

  const canCreateBatch = Boolean(jobId && statusKey === "READY");

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-40 bg-white border-b border-border">
        <div className="max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">Image Caption Processor</h1>
              <p className="text-sm text-muted-foreground">
                Prepare image uploads, create an OpenAI batch, and ingest captions automatically.
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
              <h3 className="text-sm font-semibold text-purple-900">Directory setup</h3>
              <p className="text-xs text-purple-700 mt-0.5">
                Select a local directory with jpg, jpeg, png, or webp images. We&apos;ll handle uploads and batching for you.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Directory Path</label>
              <Input
                placeholder="e.g. C:\\Users\\you\\Pictures\\album"
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
                className="h-11 bg-white border-purple-200 focus:border-purple-500 focus:ring-purple-500"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={prepare}
                disabled={isPreparing}
                className="h-11 bg-purple-600 hover:bg-purple-700 text-white gap-2"
              >
                {isPreparing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Preparing...
                  </>
                ) : (
                  <>
                    <FolderSearch className="w-4 h-4" /> Prepare
                  </>
                )}
              </Button>

              <Button
                onClick={submit}
                disabled={!canCreateBatch || isSubmitting}
                className="h-11 bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Create Batch
                  </>
                )}
              </Button>
            </div>

            <p className="text-xs text-purple-700">
              Captions use the default prompt: “{DEFAULT_PROMPT}”
            </p>
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
              <div className={`bg-linear-to-br rounded-xl p-6 border shadow-sm ${statusClasses.card}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-2">
                      {statusKey === "FAILED" ? (
                        <XCircle className="w-4 h-4 text-rose-600" />
                      ) : statusKey === "READY" || statusKey === "COMPLETED" || statusKey === "SUCCESSFUL" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                      )}
                      <span className={statusClasses.text}>{statusLabel}</span>
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${statusClasses.text}`}>
                      {(progress.processed ?? 0).toLocaleString()} / {(
                        progress.total ?? 0
                      ).toLocaleString()}
                    </p>
                  </div>
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${statusClasses.badge}`}>
                    {pct}%
                  </div>
                </div>

                <div className="space-y-2">
                  <div className={`h-2.5 w-full rounded-full ${statusClasses.meterBg}`}>
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${statusClasses.meterFill}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-700">{progressMessage}</p>
                  {etaLabel && (
                    <p className="text-xs text-gray-600">
                      Estimated time remaining: <span className="font-semibold">{etaLabel}</span>
                    </p>
                  )}
                  {(progress?.failed ?? 0) > 0 && (
                    <p className="text-xs text-rose-700">
                      {progress.failed} item{progress.failed === 1 ? "" : "s"} failed during processing.
                    </p>
                  )}
                  {statusKey === "FAILED" && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <p className="text-xs text-rose-700">The batch failed. You can retry only failed images.</p>
                      <Button
                        size="sm"
                        onClick={recreate}
                        disabled={isSubmitting}
                        className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" /> Retrying...
                          </>
                        ) : (
                          <>
                            <RotateCw className="w-3 h-3" /> Recreate Batch
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                  {statusKey === "PREPARING" && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Button
                        size="sm"
                        onClick={cancelPrep}
                        className="gap-2 bg-gray-600 hover:bg-gray-700 text-white"
                      >
                        <XCircle className="w-3 h-3" /> Cancel
                      </Button>
                    </div>
                  )}
                  {statusKey === "CANCELLED" && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <Button
                        size="sm"
                        onClick={() => resumePrep()}
                        className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <RotateCw className="w-3 h-3" /> Resume
                      </Button>
                    </div>
                  )}
                  {statusKey === "READY" && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <p className="text-sm text-green-800">
                        Batch prepared—create the OpenAI batch whenever you&apos;re ready.
                      </p>
                      <Button
                        size="sm"
                        onClick={submit}
                        disabled={isSubmitting}
                        className="gap-2 bg-green-600 hover:bg-green-700"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3" /> Start Batch
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-linear-to-r from-gray-50 to-slate-50">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-gray-600" />
                <h3 className="text-sm font-semibold text-gray-900">Processing History</h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-1">
                  <Button
                    variant={historyFilter === "ALL" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setHistoryFilter("ALL")}
                  >
                    All
                  </Button>
                  <Button
                    variant={historyFilter === "READY" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setHistoryFilter("READY")}
                  >
                    Ready
                  </Button>
                  <Button
                    variant={historyFilter === "COMPLETED" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setHistoryFilter("COMPLETED")}
                  >
                    Completed
                  </Button>
                  <Button
                    variant={historyFilter === "PREPARING" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setHistoryFilter("PREPARING")}
                  >
                    Preparing
                  </Button>
                  <Button
                    variant={historyFilter === "RUNNING" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setHistoryFilter("RUNNING")}
                  >
                    Running
                  </Button>
                  <Button
                    variant={historyFilter === "FAILED" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setHistoryFilter("FAILED")}
                  >
                    Failed
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleHistoryRefresh}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCw className="w-4 h-4" />
                  )}
                  Refresh
                </Button>
              </div>
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
                {filteredHistory.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="py-12 px-6">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                          <History className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-sm font-medium text-gray-900">No matching history</p>
                        <p className="text-xs text-gray-500 mt-1">Try a different filter or refresh</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHistory.map((h) => {
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
                      <TableRow key={h.jobId} className="hover:bg-blue-50/50 transition-colors">
                        <TableCell className="font-mono text-xs sm:text-sm break-all py-4 px-6 text-gray-700">
                          {h.dirPath}
                        </TableCell>
                        <TableCell className="text-center py-4 px-6">
                          <div className="flex flex-col items-center gap-2">
                            <span
                              className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold ${
                                h.status === "SUCCESSFUL"
                                  ? "bg-teal-100 text-teal-700"
                                  : h.status === "COMPLETED"
                                    ? "bg-green-100 text-green-700"
                                    : h.status === "RUNNING"
                                      ? "bg-orange-100 text-orange-700"
                                      : h.status === "FAILED"
                                        ? "bg-red-100 text-red-700"
                                        : h.status === "READY"
                                          ? "bg-emerald-100 text-emerald-700"
                                          : h.status === "CANCELLED"
                                            ? "bg-gray-100 text-gray-700"
                                          : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {h.status === "SUCCESSFUL" ? "SUCCESSFUL" : h.status}
                              {h.status === "SUCCESSFUL" && (
                                <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-200 text-teal-900">Ingested</span>
                              )}
                            </span>
                            {h.status === "PREPARING" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setJobId(h.jobId);
                                  cancelPrep();
                                }}
                                className="gap-2"
                              >
                                <XCircle className="w-3 h-3" /> Cancel
                              </Button>
                            )}
                            {h.status === "CANCELLED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => resumePrep(h.jobId)}
                                className="gap-2"
                              >
                                <RotateCw className="w-3 h-3" /> Resume
                              </Button>
                            )}
                            {h.status === "COMPLETED" && h.processed === 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={ingestingJobs.has(h.jobId)}
                                onClick={() => ingestOutput(h.jobId)}
                                className="gap-2"
                              >
                                {ingestingJobs.has(h.jobId) ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" /> Ingesting...
                                  </>
                                ) : (
                                  <>
                                    <RotateCw className="w-3 h-3" /> Ingest Output
                                  </>
                                )}
                              </Button>
                            )}
                            {h.status === "READY" && (
                              <Button
                                size="sm"
                                onClick={() => createFromHistory(h.jobId)}
                                disabled={isSubmitting}
                                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                              >
                                {isSubmitting ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" /> Creating...
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3 h-3" /> Create Batch
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center py-4 px-6">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                            {h.processed}/{h.total}
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-4 px-6">
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-medium text-gray-700">{timeAgo}</span>
                            <span className="text-xs text-gray-500">
                              {processedDate.toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
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
