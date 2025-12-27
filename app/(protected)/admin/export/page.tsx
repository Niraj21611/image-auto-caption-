import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ExportBatchesClient from "../_components/ExportBatchesClient";
import { getCompletedBatches } from "@/lib/actions/export.actions";

export default async function AdminExportPage() {
  const session = await getServerSession(nextauthOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/signin");
  }

  const batchesResult = await getCompletedBatches();

  if (!batchesResult.success) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <h2 className="text-2xl font-bold text-red-600">Error</h2>
            <p className="text-slate-600 mt-2">
              {batchesResult.error || "Failed to load completed batches"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Export Approved Images
              </h1>
              <p className="text-sm text-muted-foreground">
                Export approved images from completed batches
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <ExportBatchesClient batches={batchesResult.data || []} />
      </div>
    </div>
  );
}
