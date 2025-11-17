import {
  getUserAssignedJobs,
  getCaptionsPage,
  getUserBatchSummaries,
} from "@/lib/actions/review.actions";
import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";
import ReviewClient from "./ReviewClient";
import Link from "next/link";

export default async function ReviewPage(props: {
  searchParams: Promise<{ jobId?: string }>;
}) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(nextauthOptions);
  const incomingJobId = searchParams?.jobId;
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-neutral-900">
            User not identified
          </h2>
          <p className="text-neutral-600">Please sign in and try again.</p>
        </div>
      </div>
    );
  }

  const jobs = await getUserAssignedJobs(userId);

  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-neutral-900">
            No Assignments
          </h2>
          <p className="text-neutral-600">
            You don&apos;t have any batches assigned for review yet.
          </p>
        </div>
      </div>
    );
  }

  let selectedJobId = incomingJobId;

  if (!selectedJobId || !jobs.some((j) => j.id === selectedJobId)) {
    selectedJobId = jobs[0].id;
  }

  const selectedJob = jobs.find((j) => j.id === selectedJobId)!;

  const [initialData, summaries] = await Promise.all([
    getCaptionsPage(selectedJob.id, 0, 10),
    getUserBatchSummaries(userId),
  ]);

  if (initialData.items.length === 0) {
    return (
      <div className="flex flex-col min-h-screen">
        {/* BATCH HEADER */}
        <div className="sticky top-0 z-40 bg-white border-b border-border">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <h1 className="text-lg font-semibold">Your Assigned Batches</h1>

            <div className="mt-3 flex flex-wrap gap-2">
              {summaries.map((s) => (
                <Link
                  key={s.id}
                  href={`/user/review?jobId=${s.id}`}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm ${
                    s.id === selectedJobId
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-neutral-800 border-neutral-200 hover:border-blue-300"
                  }`}
                >
                  {s.dirPath.split(/[\\/]/).pop() || s.dirPath}
                  <span className="text-xs opacity-80">
                    Avail: {s.available}
                  </span>
                  <span className="text-xs opacity-80">
                    Your Reviewed: {s.underReview}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-bold">All Caught Up!</h2>
            <p>No pending images in this batch.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-40 bg-white border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-lg font-semibold">Your Assigned Batches</h1>

          <div className="mt-3 flex flex-wrap gap-2">
            {summaries.map((s) => (
              <Link
                key={s.id}
                href={`/user/review?jobId=${s.id}`}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm ${
                  s.id === selectedJobId
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-neutral-800 border-neutral-200 hover:border-blue-300"
                }`}
              >
                {s.dirPath.split(/[\\/]/).pop() || s.dirPath}
                <span className="text-xs opacity-80">Avail: {s.available}</span>
                <span className="text-xs opacity-80">
                  Your Reviewed: {s.underReview}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <ReviewClient
        userId={userId}
        jobs={jobs}
        initialJob={selectedJob}
        initialData={initialData}
      />
    </div>
  );
}
