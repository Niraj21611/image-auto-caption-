import Link from "next/link";
import { listCompletedJobs } from "@/lib/actions/assignment.actions";
import {
  CheckCircle2,
  FolderCheck,
  ChevronRight,
  Clock,
  Image as ImageIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ApprovePage() {
  const jobs = await listCompletedJobs();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Track Batches
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and track completed image batches
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6">
        {/* Stats Card */}
        <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-600">
                Total Completed Batches
              </p>
              <p className="text-3xl font-bold text-neutral-900 mt-1">
                {jobs.length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <FolderCheck className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Jobs List */}
        {jobs.length === 0 ? (
          <div className="bg-linear-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300 p-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="rounded-full bg-white p-6 shadow-md">
                <FolderCheck className="w-16 h-16 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900">
                  No Completed Batches
                </h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  There are no completed processing batches available for
                  approval yet. Process some images first.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {jobs.map((job) => {
              const reviewProgress =
                job.totalImages > 0
                  ? Math.round((job.reviewed / job.totalImages) * 100)
                  : 0;
              const processProgress =
                job.totalImages > 0
                  ? Math.round((job.processed / job.totalImages) * 100)
                  : 0;

              return (
                <Link
                  key={job.id}
                  href={`/admin/assign/${job.id}`}
                  className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Directory Path */}
                      <div className="flex items-center gap-2 mb-2">
                        <FolderCheck className="w-5 h-5 text-green-600 shrink-0" />
                        <h3 className="text-base font-semibold text-neutral-900 truncate">
                          {job.dirPath}
                        </h3>
                      </div>

                      {/* Stats Row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-neutral-500">
                            Total Images
                          </p>
                          <p className="text-lg font-bold text-neutral-900 flex items-center gap-1">
                            <ImageIcon className="w-4 h-4 text-neutral-600" />
                            {job.totalImages}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500">Processed</p>
                          <p className="text-lg font-bold text-blue-600">
                            {job.processed}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500">Reviewed</p>
                          <p className="text-lg font-bold text-green-600">
                            {job.reviewed}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500">
                            Assigned To
                          </p>
                          <p className="text-sm font-medium text-neutral-700">
                            {job.assignedUser?.name || "Unassigned"}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bars */}
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
                            <span>Processing Progress</span>
                            <span className="font-medium">
                              {processProgress}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all"
                              style={{ width: `${processProgress}%` }}
                            ></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
                            <span>Review Progress</span>
                            <span className="font-medium">
                              {reviewProgress}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{ width: `${reviewProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Created Date */}
                      <div className="flex items-center gap-1 mt-3 text-xs text-neutral-500">
                        <Clock className="w-3 h-3" />
                        Created {new Date(job.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {/* Action Icon */}
                    <div className="shrink-0">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                        <ChevronRight className="w-5 h-5 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="mt-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 px-3 py-1 text-xs font-medium border border-green-200">
                      <CheckCircle2 className="w-3 h-3" />
                      {job.status}
                    </span>
                    <span className="text-xs text-blue-600 font-medium group-hover:underline">
                      Click to review →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
