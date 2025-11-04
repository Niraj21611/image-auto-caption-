"use client";

import React, { useEffect, useState } from "react";
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
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { getUserAssignedJobs } from "@/lib/actions/review.actions";
import {
  approveAll,
  approveCaption,
  getProcessedCaptionsForUser,
  getUserBatchOverview,
  rejectCaption,
} from "@/lib/actions/assignment.actions";
import { getUser } from "@/lib/actions/user.actions";

type OverviewDataType = {
  approved: number;
  reviewed: number;
  captioned: number;
  left: number;
};

type UserAssignedJob = {
  id: string;
  dirPath: string;
  totalImages: number;
  processed: number;
  reviewed: number;
  createdAt: Date;
};

export type ProcessedCaption = {
  id: string;
  filePath: string;
  preCaption: string | null;
  postCaption: string | null;
  status: "CAPTIONED" | "REVIEWED" | "APPROVED";
  jobId: string | null;
  createdAt: Date;
  src: string;
};

export default function AdminUserAssignPage() {
  const params = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const userId = params?.userId;
  const selectedJobId = searchParams.get("jobId");

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<UserAssignedJob[]>([]);
  const [user, setUser] = useState<{ name: string; email: string } | null>(
    null
  );
  const [overview, setOverview] = useState<OverviewDataType | null>(null);
  const [captions, setCaptions] = useState<ProcessedCaption[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(selectedJobId);

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        if (!userId) return;
        setLoading(true);

        const jobsRes = await getUserAssignedJobs(userId);
        setJobs(jobsRes);

        const jobId = selectedJobId || jobsRes[0]?.id;
        setActiveJobId(jobId);

        const [userRes, overviewRes, captionsRes] = await Promise.all([
          getUser(userId),
          getUserBatchOverview(userId, jobId),
          getProcessedCaptionsForUser(userId, jobId),
        ]);

        if (userRes.success && userRes.data) {
          setUser(userRes.data);
        }
        if (overviewRes.success && overviewRes.data) {
          setOverview(overviewRes.data);
        }
        if (captionsRes.success && captionsRes.data) {
          setCaptions(captionsRes.data);
        }
      } catch (err) {
        console.error("Error fetching assignment data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [userId, selectedJobId]);

  const handleApprove = async (captionId: string) => {
    await approveCaption(captionId, userId);
  };

  const handleReject = async (captionId: string) => {
    await rejectCaption(captionId, userId);
  };

  const handleApproveAll = async () => {
    await approveAll(userId, activeJobId!);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-blue-600">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading reviewer data...
      </div>
    );
  }

  if (!jobs.length) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold text-neutral-900">
          No assigned batches
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
          <div className="flex flex-wrap items-center gap-2">
            {jobs.map((j) => (
              <Button
                key={j.id}
                variant={j.id === activeJobId ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  router.push(`/admin/assign/${userId}?jobId=${j.id}`)
                }
              >
                {j.dirPath.split(/[\\/]/).pop() || j.dirPath}
              </Button>
            ))}
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
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-600">
            Showing processed images for the selected batch.
          </div>
          <Button
            onClick={handleApproveAll}
            className="bg-green-600 hover:bg-green-700"
          >
            Approve All
          </Button>
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
                    src={c.src}
                    alt="preview"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute top-2 left-2">
                    {c.status === "REVIEWED" ? (
                      <Badge text="Reviewed" color="emerald" />
                    ) : (
                      <Badge text="Captioned" color="gray" />
                    )}
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
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="sm"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleReject(c.id)}
                    variant="outline"
                    className="w-full"
                    size="sm"
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
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
