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
import { scanMediaFolders } from "@/lib/actions/scan.actions";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface HistoryRow {
  jobId: string;
  dirPath: string;
  status: string;
  processed: number;
  total: number;
  createdAt: string;
}

interface MediaFolderInfo {
  fullPath: string;
  relativePath: string;
  imageCount: number;
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
  type HistoryFilter = "ALL" | "READY" | "COMPLETED" | "PREPARING" | "FAILED" | "RUNNING" | "CANCELLED";
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("ALL");
  const [ingestingJobs, setIngestingJobs] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prepPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scan mode states
  const [isScanning, setIsScanning] = useState(false);
  const [scannedFolders, setScannedFolders] = useState<MediaFolderInfo[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [showScanModal, setShowScanModal] = useState(false);

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

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredHistory.slice(startIndex, endIndex);
  }, [filteredHistory, currentPage, itemsPerPage]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [historyFilter]);

  const readyJobs = useMemo(() => {
    return history.filter((h) => normalizeStatus(h.status) === "READY");
  }, [history]);

  const completedJobsNeedingIngest = useMemo(() => {
    return history.filter((h) => h.status === "COMPLETED" && h.processed === 0);
  }, [history]);

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

  const scanFolders = async () => {
    const pathToUse = dirPath.trim();
    if (!pathToUse) {
      toast.error("Root path is required (e.g., root/place)");
      return;
    }
    setIsScanning(true);
    try {
      const res = await scanMediaFolders(pathToUse);
      if (!res.success || !res.data) {
        toast.error(res.error || "Failed to scan folders");
        return;
      }
      if (res.data.length === 0) {
        toast.info("No 'media' folders found in the given path");
        return;
      }
      setScannedFolders(res.data);
      setSelectedFolders(new Set(res.data.map((f) => f.fullPath)));
      setShowScanModal(true);
      toast.success(`Found ${res.data.length} media folder(s)`);
    } catch (err) {
      console.error("scanFolders error", err);
      toast.error("Failed to scan folders");
    } finally {
      setIsScanning(false);
    }
  };

  const prepareSelected = async () => {
    if (selectedFolders.size === 0) {
      toast.error("Select at least one folder to prepare");
      return;
    }
    setShowScanModal(false);
    setIsPreparing(true);
    try {
      const foldersToPrep = scannedFolders.filter((f) => selectedFolders.has(f.fullPath));
      
      for (const folder of foldersToPrep) {
        const res = await prepareAndUpload(folder.fullPath);
        if (!res.success || !res.data?.jobId) {
          toast.error(`Failed to prepare ${folder.relativePath}: ${res.error || "unknown error"}`);
          continue;
        }
        const { jobId: newJobId, total } = res.data;
        
        // Track the first job for primary display
        if (!jobId) {
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
        }
        
        toast.success(`Preparing ${folder.relativePath} (${total} images)`);
      }
      
      await fetchHistory();
      toast.info(`Prepared ${foldersToPrep.length} folder(s). Check Processing History for status.`);
    } catch (err) {
      console.error("prepareSelected error", err);
      toast.error("Failed to prepare selected folders");
    } finally {
      setIsPreparing(false);
    }
  };

  const prepareAll = async () => {
    setSelectedFolders(new Set(scannedFolders.map((f) => f.fullPath)));
    await prepareSelected();
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

  const createAllReadyBatches = async () => {
    if (readyJobs.length === 0) return;
    setIsSubmitting(true);
    let successCount = 0;
    try {
      for (const job of readyJobs) {
        const res = await createCaptionBatch(job.jobId, DEFAULT_PROMPT);
        if (res.success) {
          successCount++;
        }
      }
      toast.success(`Created ${successCount} batch(es) out of ${readyJobs.length}`);
      await fetchHistory();
    } catch (err) {
      console.error("createAllReadyBatches error", err);
      toast.error("Failed to create all batches");
    } finally {
      setIsSubmitting(false);
    }
  };

  const ingestAllCompleted = async () => {
    if (completedJobsNeedingIngest.length === 0) return;
    const jobIds = completedJobsNeedingIngest.map((j) => j.jobId);
    setIngestingJobs(new Set(jobIds));
    let successCount = 0;
    try {
      for (const job of completedJobsNeedingIngest) {
        const res = await ingestBatchOutput(job.jobId);
        if (res.success) {
          successCount++;
        }
      }
      toast.success(`Ingested ${successCount} batch(es) out of ${completedJobsNeedingIngest.length}`);
      await fetchHistory();
    } catch (err) {
      console.error("ingestAllCompleted error", err);
      toast.error("Failed to ingest all batches");
    } finally {
      setIngestingJobs(new Set());
    }
  };

  const retryFailedBatch = async (targetJobId: string) => {
    setIsSubmitting(true);
    try {
      const res = await recreateFailedCaptionBatch(targetJobId);
      if (!res.success || !res.data?.batchId) {
        toast.error(res.error || "Failed to retry batch");
        return;
      }
      toast.success("Batch recreated for failed images");
      await fetchHistory();
    } catch (err) {
      console.error("retryFailedBatch error", err);
      toast.error("Failed to retry batch");
    } finally {
      setIsSubmitting(false);
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
              <label className="text-xs font-medium text-gray-700">
                Directory Path (enter exact folder or root/place to scan for year/month/media structure)
              </label>
              <Input
                placeholder="e.g. C:\\root\\place or C:\\Users\\you\\Pictures\\album"
                value={dirPath}
                onChange={(e) => setDirPath(e.target.value)}
                className="h-11 bg-white border-purple-200 focus:border-purple-500 focus:ring-purple-500"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={prepare}
                disabled={isPreparing || isScanning}
                className="h-11 bg-purple-600 hover:bg-purple-700 text-white gap-2"
              >
                {isPreparing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Preparing...
                  </>
                ) : (
                  <>
                    <FolderSearch className="w-4 h-4" /> Prepare Single
                  </>
                )}
              </Button>

              <Button
                onClick={scanFolders}
                disabled={isPreparing || isScanning}
                variant="outline"
                className="h-11 border-purple-200 text-purple-700 hover:bg-purple-50 gap-2"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Scanning...
                  </>
                ) : (
                  <>
                    <FolderSearch className="w-4 h-4" /> Scan & Select
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
                {/* Status Filter Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
                      </svg>
                      {historyFilter === "ALL" ? "All Status" : historyFilter}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setHistoryFilter("ALL")}>
                      All Status
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryFilter("READY")}>
                      Ready
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryFilter("COMPLETED")}>
                      Completed
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryFilter("PREPARING")}>
                      Preparing
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryFilter("RUNNING")}>
                      Running
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryFilter("FAILED")}>
                      Failed
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryFilter("CANCELLED")}>
                      Cancelled
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Bulk Actions */}
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2 bg-green-600 hover:bg-green-700"
                  onClick={createAllReadyBatches}
                  disabled={readyJobs.length <= 1 || isSubmitting}
                  title={readyJobs.length <= 1 ? "Need at least 2 ready jobs" : `Create ${readyJobs.length} batches`}
                >
                  <Send className="w-4 h-4" />
                  Create All ({readyJobs.length})
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                  onClick={ingestAllCompleted}
                  disabled={completedJobsNeedingIngest.length <= 1 || ingestingJobs.size > 0}
                  title={completedJobsNeedingIngest.length <= 1 ? "Need at least 2 completed jobs" : `Ingest ${completedJobsNeedingIngest.length} batches`}
                >
                  <RotateCw className="w-4 h-4" />
                  Ingest All ({completedJobsNeedingIngest.length})
                </Button>

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
                {paginatedHistory.length === 0 ? (
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
                  paginatedHistory.map((h) => {
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
                            {h.status === "FAILED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => retryFailedBatch(h.jobId)}
                                disabled={isSubmitting}
                                className="gap-2 border-red-200 text-red-600 hover:bg-red-50"
                              >
                                {isSubmitting ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" /> Retrying...
                                  </>
                                ) : (
                                  <>
                                    <RotateCw className="w-3 h-3" /> Retry Batch
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredHistory.length)} of {filteredHistory.length} {historyFilter !== "ALL" ? historyFilter.toLowerCase() : ""} batches
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      // Show first page, last page, current page, and pages around current
                      const showPage =
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1);
                      
                      if (!showPage) {
                        // Show ellipsis
                        if (page === currentPage - 2 || page === currentPage + 2) {
                          return (
                            <PaginationItem key={page}>
                              <span className="px-4 py-2">...</span>
                            </PaginationItem>
                          );
                        }
                        return null;
                      }

                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scan & Select Modal */}
      <Dialog open={showScanModal} onOpenChange={setShowScanModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Select Media Folders to Prepare
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Found {scannedFolders.length} media folder(s). Select which ones to prepare for batch processing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4 max-h-96 overflow-y-auto">
            {scannedFolders.map((folder) => (
              <div
                key={folder.fullPath}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                <input
                  type="checkbox"
                  checked={selectedFolders.has(folder.fullPath)}
                  onChange={(e) => {
                    setSelectedFolders((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) {
                        next.add(folder.fullPath);
                      } else {
                        next.delete(folder.fullPath);
                      }
                      return next;
                    });
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{folder.relativePath}</div>
                  <div className="text-xs text-gray-500">{folder.fullPath}</div>
                </div>
                <div className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-1 rounded">
                  {folder.imageCount} images
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowScanModal(false)}
              className="font-medium"
            >
              Cancel
            </Button>
            <Button
              onClick={prepareAll}
              disabled={isPreparing}
              className="bg-purple-600 hover:bg-purple-700 font-medium gap-2"
            >
              {isPreparing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Preparing...
                </>
              ) : (
                <>
                  Prepare All ({scannedFolders.length})
                </>
              )}
            </Button>
            <Button
              onClick={prepareSelected}
              disabled={isPreparing || selectedFolders.size === 0}
              className="bg-blue-600 hover:bg-blue-700 font-medium gap-2"
            >
              {isPreparing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Preparing...
                </>
              ) : (
                <>
                  Prepare Selected ({selectedFolders.size})
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
