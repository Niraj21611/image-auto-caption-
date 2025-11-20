import React from "react";
import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getAdminDashboardStats } from "@/lib/actions/dashboard.actions";
import Link from "next/link";
import {
  Users,
  FolderKanban,
  CheckCircle2,
  XCircle,
  PlayCircle,
  UserCheck,
  UserX,
  Image as ImageIcon,
  Clock,
} from "lucide-react";

async function AdminPage() {
  const session = await getServerSession(nextauthOptions);

  if (!session?.user) {
    redirect("/signin");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/user");
  }

  const statsResult = await getAdminDashboardStats();

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
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border mb-6">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Admin Dashboard
              </h1>
              <p className="text-sm text-muted-foreground">
                Welcome back, {session.user.name || "Admin"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/process"
                className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
              >
                <PlayCircle className="h-4 w-4 text-blue-600" />
                <span>Process Batch</span>
              </Link>
              <Link
                href="/admin/assign"
                className="inline-flex items-center gap-2 rounded-md border border-purple-200 bg-white px-3 py-2 text-sm font-medium text-purple-700 transition hover:border-purple-300 hover:bg-purple-50"
              >
                <UserCheck className="h-4 w-4 text-purple-600" />
                <span>Assign Batches</span>
              </Link>
              <Link
                href="/admin/user"
                className="inline-flex items-center gap-2 rounded-md border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-700 transition hover:border-teal-300 hover:bg-teal-50"
              >
                <Users className="h-4 w-4 text-teal-600" />
                <span>Manage Users</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-8">
        {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Users */}
        <Link
          href="/admin/user"
          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border-l-4 border-blue-500 hover:scale-105 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">
                Total Users
              </p>
              <p className="text-3xl font-bold text-slate-800">
                {stats.totalUsers}
              </p>
            </div>
            <div className="bg-blue-100 p-3 rounded-lg">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm">
            <span className="text-green-600 font-medium flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {stats.currentlyOnline} online
            </span>
          </div>
        </Link>

        {/* Total Batches */}
        <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">
                Total Batches
              </p>
              <p className="text-3xl font-bold text-slate-800">
                {stats.totalBatches}
              </p>
            </div>
            <div className="bg-purple-100 p-3 rounded-lg">
              <FolderKanban className="w-8 h-8 text-purple-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs">
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {stats.completedBatches} done
            </span>
            <span className="text-red-600 flex items-center gap-1">
              <XCircle className="w-3 h-3" />
              {stats.failedBatches} failed
            </span>
          </div>
        </div>

        {/* Running Batches */}
        <Link
          href="/admin/process"
          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 border-l-4 border-amber-500 hover:scale-105 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">
                Running Batches
              </p>
              <p className="text-3xl font-bold text-slate-800">
                {stats.runningBatches}
              </p>
            </div>
            <div className="bg-amber-100 p-3 rounded-lg">
              <PlayCircle className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{
                  width: `${stats.totalBatches > 0 ? (stats.runningBatches / stats.totalBatches) * 100 : 0}%`,
                }}
              ></div>
            </div>
          </div>
        </Link>

        {/* Total Images Processed */}
        <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-600 mb-1">
                Images Processed
              </p>
              <p className="text-3xl font-bold text-slate-800">
                {stats.totalImagesProcessed}
              </p>
            </div>
            <div className="bg-green-100 p-3 rounded-lg">
              <ImageIcon className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            of {stats.totalImages} total ({stats.totalImagesFailed} failed)
          </div>
        </div>
      </div>

      {/* Batch Assignment Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assigned Batches */}
        <Link
          href="/admin/assign"
          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 hover:scale-[1.02] cursor-pointer"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-teal-100 p-3 rounded-lg">
              <UserCheck className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                Assigned Batches
              </h3>
              <p className="text-sm text-slate-600">
                Batches assigned to users
              </p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-bold text-teal-600">
              {stats.assignedBatches}
            </p>
            <p className="text-sm text-slate-500 pb-1">
              {stats.totalBatches > 0
                ? Math.round(
                    (stats.assignedBatches / stats.totalBatches) * 100
                  )
                : 0}
              % of total
            </p>
          </div>
        </Link>

        {/* Unassigned Batches */}
        <Link
          href="/admin/assign"
          className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all p-6 hover:scale-[1.02] cursor-pointer"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-rose-100 p-3 rounded-lg">
              <UserX className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">
                Unassigned Batches
              </h3>
              <p className="text-sm text-slate-600">
                Batches awaiting assignment
              </p>
            </div>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-4xl font-bold text-rose-600">
              {stats.unassignedBatches}
            </p>
            <p className="text-sm text-slate-500 pb-1">
              {stats.totalBatches > 0
                ? Math.round(
                    (stats.unassignedBatches / stats.totalBatches) * 100
                  )
                : 0}
              % of total
            </p>
          </div>
        </Link>
      </div>

      {/* Recent Batches */}
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Recent Batches
        </h2>
        {stats.recentBatches.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No batches found</p>
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
                    Assigned To
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.recentBatches.map((batch: typeof stats.recentBatches[number]) => (
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
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {batch.processed}/{batch.totalImages}
                      {batch.failed > 0 && (
                        <span className="text-red-500 ml-1">
                          ({batch.failed} failed)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {batch.assignedUser
                        ? batch.assignedUser.name
                        : "Unassigned"}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-500">
                      {new Date(batch.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

export default AdminPage;