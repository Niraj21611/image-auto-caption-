export const dynamic = "force-dynamic";

import Link from "next/link";
import { Users, FolderCheck, UserCheck, ChevronRight } from "lucide-react";
import { listCompletedJobs, listUsers, assignJobAction } from "@/lib/actions/assignment.actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

function AssignmentForm({ 
  jobId, 
  users, 
  assignedUserId,
  assignedUser 
}: { 
  jobId: string; 
  users: User[];
  assignedUserId: string | null;
  assignedUser?: User;
}) {
  return (
    <form action={assignJobAction} className="flex items-center gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex items-center gap-2 flex-1">
        <Select name="userId" defaultValue={assignedUserId || undefined} required>
          <SelectTrigger className="w-[220px] h-9">
            <SelectValue placeholder="Select reviewer..." />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {assignedUser && (
          <Link href={`/admin/assign/${jobId}`} className="text-sm text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
            View progress
            <ChevronRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <Button 
        type="submit" 
        size="sm"
        className="bg-blue-600 hover:bg-blue-700 font-medium"
      >
        Assign
      </Button>
    </form>
  );
}

export default async function AssignPage() {
  const [jobs, users] = await Promise.all([listCompletedJobs(), listUsers()]);
  const userMap = new Map(users.map((u) => [u.id, u]));

  const unassignedCount = jobs.filter((j) => !j.assignedTo).length;
  const assignedCount = jobs.filter((j) => j.assignedTo).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Batch Assignment
              </h1>
              <p className="text-sm text-muted-foreground">
                Assign completed batches to reviewers
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Total Batches</p>
                <p className="text-3xl font-bold text-neutral-900 mt-1">{jobs.length}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <FolderCheck className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Unassigned</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{unassignedCount}</p>
              </div>
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-600">Assigned</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{assignedCount}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Jobs Table */}
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
                  There are no completed processing batches available for assignment yet. 
                  Process some images first.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-neutral-200 hover:bg-neutral-50">
                  <TableHead className="font-semibold text-neutral-800">Directory</TableHead>
                  <TableHead className="font-semibold text-neutral-800">Progress</TableHead>
                  <TableHead className="font-semibold text-neutral-800">Status</TableHead>
                  <TableHead className="font-semibold text-neutral-800">Assignment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => {
                  const assigned = j.assignedTo ? userMap.get(j.assignedTo) : undefined;
                  return (
                    <TableRow key={j.id} className="hover:bg-neutral-50 border-b border-neutral-100 last:border-0">
                      <TableCell className="font-medium">
                        <div className="max-w-[480px] truncate text-neutral-900" title={j.dirPath}>
                          {j.dirPath}
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                          {new Date(j.createdAt).toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm text-neutral-700">
                            <span className="font-semibold">{j.processed}</span> / {j.totalImages} processed
                          </div>
                          <div className="text-sm text-neutral-600">
                            <span className="font-semibold text-green-600">{j.reviewed}</span> reviewed
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {assigned ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 px-3 py-1 text-xs font-medium border border-green-200">
                              <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                              Assigned
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 px-3 py-1 text-xs font-medium border border-amber-200">
                            <div className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                            Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <AssignmentForm 
                          jobId={j.id} 
                          users={users} 
                          assignedUserId={j.assignedTo}
                          assignedUser={assigned}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Reviewers Section */}
        {users.length > 0 && (
          <div className="mt-6 bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-neutral-600" />
              <h2 className="text-lg font-semibold text-neutral-900">Available Reviewers</h2>
              <span className="text-sm text-neutral-500">({users.length})</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {users.map((u) => (
                <Link 
                  key={u.id} 
                  href={`/admin/user/${u.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 hover:border-blue-300 transition-colors group"
                >
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold text-blue-600">
                      {(u.name || u.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-neutral-900">{u.name || u.email}</div>
                    <div className="text-xs text-neutral-500">{u.email}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-blue-600 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}