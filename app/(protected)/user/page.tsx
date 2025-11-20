import React from "react";
import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserDashboardStats } from "@/lib/actions/dashboard.actions";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Image as ImageIcon,
  FolderKanban,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

async function UserPage() {
  const session = await getServerSession(nextauthOptions);

  if (!session?.user) {
    redirect("/signin");
  }

  const statsResult = await getUserDashboardStats(session.user.id);

  if (!statsResult.success || !statsResult.data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-red-600">
          Error loading dashboard
        </h1>
        <p className="text-gray-600 mt-2">
          {statsResult.error || "Failed to load stats"}
        </p>
      </div>
    );
  }

  const stats = statsResult.data;

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-indigo-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border mb-6">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                My Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Welcome back, {stats.user.name || "User"}!
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/user/review"
                className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                <span>Review Images</span>
              </Link>
              <Link
                href="/user/review"
                className="inline-flex items-center gap-2 rounded-md border border-purple-200 bg-white px-3 py-2 text-sm font-medium text-purple-700 transition hover:border-purple-300 hover:bg-purple-50"
              >
                <FolderKanban className="h-4 w-4 text-purple-600" />
                <span>My Assignments</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-8">
        {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Attendance Days */}
        <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">
                Total Attendance
              </p>
              <p className="text-3xl font-bold text-slate-800">
                {stats.totalAttendanceDays}
              </p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <Calendar className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">Days worked</div>
        </div>

        {/* Today's Work Duration */}
        <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">
                Today&apos;s Work
              </p>
              <p className="text-3xl font-bold text-slate-800">
                {Math.floor(stats.todayMinutes / 60)}h{" "}
                {stats.todayMinutes % 60}m
              </p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <Clock className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="mt-4 text-sm text-green-600 font-medium">
            {stats.todayFormatted}
          </div>
        </div>

        {/* Total Processed Images */}
        <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">
                Images Reviewed
              </p>
              <p className="text-3xl font-bold text-slate-800">
                {stats.processedImages}
              </p>
            </div>
            <div className="bg-purple-100 p-3 rounded-lg">
              <ImageIcon className="w-8 h-8 text-purple-600" />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">Total completed</div>
        </div>

        {/* Currently Assigned */}
        <Link
          href="/user/review"
          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border-l-4 border-amber-500 hover:scale-105 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">
                Active Batches
              </p>
              <p className="text-3xl font-bold text-slate-800">
                {stats.currentlyAssigned}
              </p>
            </div>
            <div className="bg-amber-100 p-3 rounded-lg">
              <FolderKanban className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          <div className="mt-4 text-sm text-amber-600 font-medium">
            Click to review →
          </div>
        </Link>
      </div>

      {/* Work Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Completed Batches */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-green-100 p-3 rounded-lg">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                Completed Batches
              </h3>
              <p className="text-sm text-slate-600">
                Batches you&apos;ve finished
              </p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-bold text-green-600">
              {stats.completedBatches}
            </p>
            <div className="flex items-center gap-1 text-green-600 text-sm pb-1">
              <TrendingUp className="w-4 h-4" />
              <span>Great job!</span>
            </div>
          </div>
        </div>

        {/* Pending Review */}
        <Link
          href="/user/review"
          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 hover:scale-[1.02] cursor-pointer"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-orange-100 p-3 rounded-lg">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                Pending Review
              </h3>
              <p className="text-sm text-slate-600">Images awaiting review</p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-bold text-orange-600">
              {stats.pendingReview}
            </p>
            <p className="text-sm text-slate-500 pb-1">
              {stats.pendingReview > 0 ? "Start reviewing →" : "All done!"}
            </p>
          </div>
        </Link>
      </div>

      {/* Assigned Batches */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          My Assigned Batches
        </h2>
        {stats.assignedBatches.length === 0 ? (
          <div className="text-center py-12">
            <FolderKanban className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">No batches assigned yet</p>
            <p className="text-slate-400 text-sm mt-2">
              Contact admin to get assigned batches
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                    Directory
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                    Progress
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                    Reviewed
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                    Assigned Date
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.assignedBatches.map((batch: typeof stats.assignedBatches[number]) => {
                  const progress =
                    batch.totalImages > 0
                      ? Math.round(
                          (batch.processed / batch.totalImages) * 100
                        )
                      : 0;
                  const reviewProgress =
                    batch.totalImages > 0
                      ? Math.round((batch.reviewed / batch.totalImages) * 100)
                      : 0;

                  return (
                    <tr
                      key={batch.id}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-3 px-4 text-slate-700 font-mono text-xs max-w-xs truncate">
                        {batch.dirPath}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            batch.status === "COMPLETED"
                              ? "bg-green-100 text-green-800"
                              : batch.status === "FAILED"
                                ? "bg-red-100 text-red-800"
                                : batch.status === "RUNNING"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {batch.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-blue-500 h-2 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-slate-600 min-w-[60px]">
                            {batch.processed}/{batch.totalImages}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all"
                              style={{ width: `${reviewProgress}%` }}
                            ></div>
                          </div>
                          <span className="text-xs text-slate-600 min-w-[60px]">
                            {batch.reviewed}/{batch.totalImages}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-500">
                        {new Date(batch.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/user/review?jobId=${batch.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline"
                        >
                          Review →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default UserPage;