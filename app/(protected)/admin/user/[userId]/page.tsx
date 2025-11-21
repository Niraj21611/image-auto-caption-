"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FolderOpen,
  TrendingUp,
  Download,
} from "lucide-react";
import { getUserReviewStats } from "@/lib/actions/assignment.actions";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function UserAssignPage() {
  const params = useParams<{ userId: string }>();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [data, setData] = useState<{
    reviewed: number;
    pending: number;
    jobs: Array<{
      id: string;
      dirPath: string;
      totalImages: number;
      processed: number;
      reviewed: number;
      createdAt: Date;
      status: string;
      assignedUser: { name: string; email: string } | null;
    }>;
  }>({
    reviewed: 0,
    pending: 0,
    jobs: [],
  });
  const userId = params.userId;

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await getUserReviewStats(userId);
        console.log("User review stats:", res);
        if (res) {
          setData({
            reviewed: res.reviewed,
            pending: res.pending,
            jobs: res.jobs,
          });
        }
      } catch {
        console.log("Error fetching user review stats");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <div className="h-6 w-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!data.jobs.length) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
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
      </div>
    );
  }

  const completionRate =
    data.reviewed + data.pending > 0
      ? Math.round((data.reviewed / (data.reviewed + data.pending)) * 100)
      : 0;

  const exportUserToCSV = () => {
    try {
      if (!data.jobs.length || !data.jobs[0].assignedUser) {
        toast.error("No user data to export");
        return;
      }

      const user = data.jobs[0].assignedUser;
      
      // Prepare CSV headers
      const headers = [
        "User Name",
        "User Email",
        "Directory Path",
        "Total Images",
        "Processed",
        "Reviewed",
        "Pending",
        "Status",
        "Progress (%)",
        "Created At"
      ];
      
      // Prepare CSV rows
      const rows = data.jobs.map(job => {
        const pending = Math.max(0, (job.processed || 0) - (job.reviewed || 0));
        const progress = job.processed > 0 
          ? Math.round((job.reviewed / job.processed) * 100) 
          : 0;
        
        return [
          user.name,
          user.email,
          job.dirPath,
          job.totalImages.toString(),
          job.processed.toString(),
          job.reviewed.toString(),
          pending.toString(),
          job.status,
          `${progress}%`,
          new Date(job.createdAt).toLocaleString()
        ];
      });

      // Add summary row
      const summaryRow = [
        "SUMMARY",
        "",
        `Total Batches: ${data.jobs.length}`,
        "",
        "",
        `Total Reviewed: ${data.reviewed}`,
        `Total Pending: ${data.pending}`,
        "",
        `Completion Rate: ${completionRate}%`,
        ""
      ];

      // Combine headers, rows, and summary
      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
        "",
        summaryRow.map(cell => `"${cell}"`).join(",")
      ].join("\n");

      // Create blob and download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      const timestamp = new Date().toISOString().split("T")[0];
      const sanitizedName = user.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      link.setAttribute("href", url);
      link.setAttribute("download", `reviewer_${sanitizedName}_${timestamp}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success("CSV exported successfully!");
    } catch (err) {
      console.error("Error exporting CSV:", err);
      toast.error("Failed to export CSV");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Reviewer Progress
              </h1>
              <p className="text-sm text-muted-foreground">
                Track review status and assignments
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6">
        {/* Back Button & User Info */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/admin/assign">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Assignments
            </Button>
          </Link>
          
          <Button
            variant="outline"
            onClick={exportUserToCSV}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* User Card */}
        <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              {data.jobs[0].assignedUser?.name ||
                (data.jobs[0].assignedUser?.email && (
                  <span className="text-2xl font-bold text-white">
                    {(
                      data.jobs[0].assignedUser?.name ||
                      data.jobs[0].assignedUser?.email
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                ))}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-blue-900">
                {data.jobs[0].assignedUser?.name}
              </h2>
              <p className="text-blue-700">
                {data.jobs[0].assignedUser?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Reviewed</p>
                <p className="text-3xl font-bold text-green-600 mt-1">
                  {data.reviewed}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Pending</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">
                  {data.pending}
                </p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">
                  Assigned Batches
                </p>
                <p className="text-3xl font-bold text-blue-600 mt-1">
                  {data.jobs.length}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <FolderOpen className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">
                  Completion Rate
                </p>
                <p className="text-3xl font-bold text-purple-600 mt-1">
                  {completionRate}%
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Jobs Table */}
        {data.jobs.length === 0 ? (
          <div className="bg-linear-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300 p-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="rounded-full bg-white p-6 shadow-md">
                <FolderOpen className="w-16 h-16 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900">
                  No Assigned Batches
                </h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  This reviewer has no batches assigned yet. Assign batches from
                  the main assignment page.
                </p>
              </div>
              <Link href="/admin/assign">
                <Button className="bg-blue-600 hover:bg-blue-700 mt-4">
                  Go to Assignments
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200">
              <h3 className="text-lg font-semibold text-neutral-900">
                Assigned Batches
              </h3>
              <p className="text-sm text-neutral-600">
                Detailed breakdown of review progress
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-b border-neutral-200 hover:bg-neutral-50">
                  <TableHead className="font-semibold text-neutral-800">
                    Directory
                  </TableHead>
                  <TableHead className="font-semibold text-neutral-800">
                    Processed
                  </TableHead>
                  <TableHead className="font-semibold text-neutral-800">
                    Reviewed
                  </TableHead>
                  <TableHead className="font-semibold text-neutral-800">
                    Pending
                  </TableHead>
                  <TableHead className="font-semibold text-neutral-800">
                    Status
                  </TableHead>
                  <TableHead className="font-semibold text-neutral-800">
                    Progress
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.jobs.map((j) => {
                  const pending = Math.max(
                    0,
                    (j.processed || 0) - (j.reviewed || 0)
                  );
                  const progress =
                    j.processed > 0
                      ? Math.round((j.reviewed / j.processed) * 100)
                      : 0;
                  return (
                    <TableRow
                      key={j.id}
                      className="hover:bg-neutral-50 border-b border-neutral-100 last:border-0"
                    >
                      <TableCell className="font-medium">
                        <div
                          className="max-w-[420px] truncate text-neutral-900"
                          title={j.dirPath}
                        >
                          {j.dirPath}
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {new Date(j.createdAt).toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium text-neutral-700">
                          {j.processed} / {j.totalImages}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 px-2.5 py-1 text-xs font-medium border border-green-200">
                          <CheckCircle2 className="w-3 h-3" />
                          {j.reviewed}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 text-xs font-medium border border-amber-200">
                          <Clock className="w-3 h-3" />
                          {pending}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-neutral-600">
                          {j.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-neutral-600 min-w-[35px]">
                            {progress}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
