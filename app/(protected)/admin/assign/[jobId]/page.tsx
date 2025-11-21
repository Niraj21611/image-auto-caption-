"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Layers,
  Images,
  CheckSquare,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useParams } from "next/navigation";
import {
  approveAll,
  approveCaption,
  approveCaptionsBulk,
  getProcessedCaptionsPage,
  getUserBatchOverview,
  rejectCaption,
} from "@/lib/actions/assignment.actions";
import { toast } from "sonner";

type OverviewDataType = {
  approved: number;
  reviewed: number;
  captioned: number;
  left: number;
};

export type ProcessedCaption = {
  id: string;
  filePath: string;
  preCaption: string | null;
  postCaption: string | null;
  status: "CAPTIONED" | "REVIEWED" | "APPROVED" | "FAILED";
  jobId: string | null;
  createdAt: Date;
};

export default function AdminUserAssignPage() {
  const params = useParams<{ jobId: string }>();

  const jobId = params?.jobId;

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null
  );
  const [overview, setOverview] = useState<OverviewDataType | null>(null);
  const [captions, setCaptions] = useState<ProcessedCaption[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasFetched, setHasFetched] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const PAGE_SIZE = 12;

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [jobId]);

  const loadOverview = useCallback(async () => {
    if (!jobId) return;
    const res = await getUserBatchOverview(jobId);
    if (res.success && res.data) {
      setOverview(res.data);
      setUser(res.data.user);
    }
  }, [jobId]);

  const loadCaptions = useCallback(
    async (targetPage: number) => {
      if (!jobId) return;
      try {
        const res = await getProcessedCaptionsPage(jobId, targetPage, PAGE_SIZE);
        if (res.success && res.data) {
          const {
            items,
            totalPages: nextTotalPages,
            totalCount: nextTotalCount,
          } = res.data;

          if (nextTotalPages > 0 && targetPage > nextTotalPages) {
            setPage(nextTotalPages);
            return;
          }

          setCaptions(items);
          setTotalPages(nextTotalPages || 1);
          setTotalCount(nextTotalCount);
          setSelectedIds(new Set());
        } else if (!res.success) {
          toast.error(res.error || "Failed to load captions");
        }
      } catch (err) {
        console.error("Error loading captions page:", err);
        toast.error("Failed to load captions");
      } finally {
        setHasFetched(true);
      }
    },
    [jobId, PAGE_SIZE]
  );

  const loadPageData = useCallback(
    async (targetPage: number) => {
      if (!jobId) return;
      setLoading(true);
      try {
        await Promise.all([loadOverview(), loadCaptions(targetPage)]);
      } finally {
        setLoading(false);
      }
    },
    [jobId, loadCaptions, loadOverview]
  );

  useEffect(() => {
    if (!jobId) return;
    loadPageData(page);
  }, [jobId, page, loadPageData]);

  const handleApprove = async (captionId: string) => {
    try {
      setApprovingId(captionId);
      const res = await approveCaption(captionId);
      if (res.success) {
        setCaptions((prev) =>
          prev.map((c) =>
            c.id === captionId ? { ...c, status: "APPROVED" } : c
          )
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(captionId);
          return next;
        });
        await loadOverview();
        toast.success("Caption approved");
      }
    } catch {
      toast.error("Error approving caption");
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (captionId: string) => {
    try {
      setRejectingId(captionId);
      const res = await rejectCaption(captionId);
      if (res.success) {
        setCaptions((prev) =>
          prev.map((c) =>
            c.id === captionId ? { ...c, status: "CAPTIONED" } : c
          )
        );
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(captionId);
          return next;
        });
        await loadOverview();

        toast.success("Caption rejected");
      }
    } catch {
      toast.error("Error rejecting caption");
    } finally {
      setRejectingId(null);
    }
  };

  const handleApproveAll = async () => {
    try {
      if (!jobId) return;
      setApprovingAll(true);
      const res = await approveAll(jobId);
      if (res.success) {
        await Promise.all([loadOverview(), loadCaptions(page)]);
        setSelectedIds(new Set());
        toast.success("All captions approved");
      }
    } catch {
      toast.error("Error approving all captions");
      return;
    } finally {
      setApprovingAll(false);
    }
  };

  const handleApproveSelected = async () => {
    if (!selectedIds.size) return;
    try {
      setBulkApproving(true);
      const res = await approveCaptionsBulk(Array.from(selectedIds));
      if (res.success) {
        setCaptions((prev) =>
          prev.map((c) =>
            selectedIds.has(c.id) ? { ...c, status: "APPROVED" } : c
          )
        );
        setSelectedIds(new Set());
        await loadOverview();
        toast.success("Selected captions approved");
      } else if (res.error) {
        toast.error(res.error);
      }
    } catch (err) {
      console.error("Error approving selected captions:", err);
      toast.error("Error approving selected captions");
    } finally {
      setBulkApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-blue-600">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading data...
      </div>
    );
  }

  if (!loading && hasFetched && totalCount === 0) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-neutral-900">
          All captions are approved
        </h2>
        <Link
          href="/admin/assign"
          className="text-blue-600 hover:underline mt-2 inline-block"
        >
          Back to assignments
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-neutral-900">
          User not found
        </h2>
        <Link
          href="/admin/assign"
          className="text-blue-600 hover:underline mt-2 inline-block"
        >
          Back to assignments
        </Link>
      </div>
    );
  }

  const selectedCount = selectedIds.size;

  const toggleSelection = (captionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(captionId)) {
        next.delete(captionId);
      } else {
        next.add(captionId);
      }
      return next;
    });
  };

  const goToPreviousPage = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPage((prev) => Math.min(totalPages, prev + 1));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-foreground">
                Reviewer Approval
              </h1>
              <p className="text-sm text-muted-foreground">
                Approve or reject processed images
              </p>
            </div>
            <Link href="/admin/assign">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 space-y-6">
        {/* User + Job Switcher */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-lg font-bold text-white">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="text-base font-semibold text-neutral-900">
                {user.name || user.email}
              </div>
              <div className="text-sm text-neutral-600">{user.email}</div>
            </div>
          </div>
        </div>

        {/* Overview Cards */}
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <OverviewCard
              label="Processed"
              value={overview.captioned}
              icon={<Layers className="w-5 h-5 text-blue-600" />}
            />
            <OverviewCard
              label="Approved"
              value={overview.approved}
              icon={<CheckSquare className="w-5 h-5 text-green-600" />}
            />
            <OverviewCard
              label="Reviewed"
              value={overview.reviewed}
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            />
            <OverviewCard
              label="Left to Approve"
              value={overview.left}
              icon={<Images className="w-5 h-5 text-amber-600" />}
            />
          </div>
        )}

        {/* Approve All */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-neutral-600">
            Showing {captions.length} of {totalCount} images (page {page} of {totalPages}).
            {selectedCount > 0 && (
              <span className="ml-2 font-medium text-neutral-800">
                {selectedCount} selected
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleApproveSelected}
              disabled={!selectedCount || bulkApproving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {bulkApproving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Approving...
                </span>
              ) : (
                "Approve Selected"
              )}
            </Button>
            <Button
              onClick={handleApproveAll}
              disabled={approvingAll || totalCount === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {approvingAll ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Approving...
                </span>
              ) : (
                "Approve All"
              )}
            </Button>
          </div>
        </div>

        {/* Captions Grid */}
        {captions.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-lg p-8 text-center text-neutral-600">
            No processed images yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {captions.map((c) => (
              <div
                key={c.id}
                className="bg-white border border-neutral-200 rounded-lg overflow-hidden shadow-sm"
              >
                <div className="relative aspect-video bg-neutral-100">
                  <Image
                    src={`/api/file?path=${encodeURIComponent(c.filePath)}`}
                    alt="preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />

                  <div className="absolute top-2 left-2">
                    {c.status === "APPROVED" ? (
                      <Badge text="Approved" color="blue" />
                    ) : c.status === "REVIEWED" ? (
                      <Badge text="Reviewed" color="emerald" />
                    ) : (
                      <Badge text="Captioned" color="gray" />
                    )}
                  </div>
                  <div className="absolute top-2 right-2">
                    <label className="inline-flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-neutral-700 shadow">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelection(c.id)}
                      />
                      Select
                    </label>
                  </div>
                </div>

                <div className="p-3 space-y-2">
                  <CaptionBlock
                    title="Pre-Caption"
                    text={c.preCaption || "—"}
                  />
                  <CaptionBlock
                    title="Post-Caption"
                    text={c.postCaption || "—"}
                  />
                </div>

                <div className="p-3 border-t border-neutral-200 flex items-center gap-2">
                  <Button
                    onClick={() => handleApprove(c.id)}
                    disabled={c.status === "APPROVED" || approvingId === c.id || bulkApproving || approvingAll}
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="sm"
                  >
                    {approvingId === c.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Approving
                      </span>
                    ) : (
                      "Approve"
                    )}
                  </Button>
                  <Button
                    onClick={() => handleReject(c.id)}
                    variant="outline"
                    className="w-full border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    size="sm"
                    disabled={rejectingId === c.id}
                  >
                    {rejectingId === c.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Rejecting
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1">
                        <XCircle className="w-4 h-4" /> Reject
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-neutral-600">
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousPage}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextPage}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-5 shadow-sm flex items-center justify-between">
      <div>
        <p className="text-sm text-neutral-600">{label}</p>
        <p className="text-3xl font-bold text-neutral-900">{value}</p>
      </div>
      <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center">
        {icon}
      </div>
    </div>
  );
}

function CaptionBlock({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-neutral-800">{title}</div>
      <div className="text-xs text-neutral-700 bg-neutral-50 border border-neutral-200 rounded p-2 whitespace-pre-wrap max-h-28 overflow-auto">
        {text}
      </div>
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-${color}-600 text-white px-2 py-0.5 text-[10px] font-medium shadow`}
    >
      {text}
    </span>
  );
}
