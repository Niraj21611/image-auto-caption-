import {
  getUserAssignedJobs,
  getCaptionsPage,
  getUserBatchSummaries,
} from "@/lib/actions/review.actions";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";
import ReviewClient from "../_components/ReviewClient";
import BatchHeader from "../_components/BatchHeader";

export const dynamic = "force-dynamic";

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
    const summaryMap = new Map(summaries.map((s) => [s.id, s]));
    return (
      <div className="flex flex-col min-h-screen">
        <BatchHeader summaries={summaries} selectedJobId={selectedJobId} userId={userId} />

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold">All Caught Up!</h2>
            <p className="text-neutral-600">
              No pending images in this batch. You can switch to another assigned batch below.
            </p>
          </div>

          <div className="w-full max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {jobs.map((job) => {
                const summary = summaryMap.get(job.id);
                const dirLabel = job.dirPath.split(/[\\/]/).pop() || job.dirPath;
                return (
                  <Link
                    key={job.id}
                    href={`/user/review?jobId=${job.id}`}
                    className={`rounded-lg border p-4 transition-all hover:shadow-sm hover:border-blue-300 ${
                      job.id === selectedJobId
                        ? "border-blue-600 bg-blue-50"
                        : "border-neutral-200 bg-white"
                    }`}
                  >
                    <div className="font-semibold text-neutral-900 truncate" title={job.dirPath}>
                      {dirLabel}
                    </div>
                    <div className="mt-2 text-sm text-neutral-600 flex gap-3">
                      <span>{summary?.available ?? 0} pending</span>
                      <span>{summary?.underReview ?? 0} reviewed</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <BatchHeader summaries={summaries} selectedJobId={selectedJobId} userId={userId} />

      <ReviewClient
        key={selectedJob.id}
        userId={userId}
        jobs={jobs}
        initialJob={selectedJob}
        initialData={initialData}
      />
    </div>
  );
}
