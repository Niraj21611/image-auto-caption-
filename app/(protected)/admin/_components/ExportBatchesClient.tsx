"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, FolderOpen, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Info } from "lucide-react";
import { 
  exportApprovedImages, 
  getExportHistory, 
  getExportStats, 
  getLastExportPath 
} from "@/lib/actions/export.actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Batch {
  id: string;
  dirPath: string;
  totalImages: number;
  processed: number;
  approvedCount: number;
  status: string;
  createdAt: Date;
}

interface ExportBatchesClientProps {
  batches: Batch[];
}

interface ExportHistoryItem {
  id: string;
  destinationPath: string;
  exportedCount: number;
  exportedAt: Date;
  exportedBy: string;
}

interface ExportStats {
  newImages: number;
  previouslyExported: number;
  totalApproved: number;
}

export default function ExportBatchesClient({ batches }: ExportBatchesClientProps) {
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [destinationPath, setDestinationPath] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [exportHistory, setExportHistory] = useState<ExportHistoryItem[]>([]);
  const [exportStats, setExportStats] = useState<ExportStats | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Load export data when dialog opens
  useEffect(() => {
    if (isDialogOpen && selectedBatch) {
      loadExportData(selectedBatch);
    }
  }, [isDialogOpen, selectedBatch]);

  const loadExportData = async (jobId: string) => {
    try {
      const [statsResult, historyResult, lastPathResult] = await Promise.all([
        getExportStats(jobId),
        getExportHistory(jobId),
        getLastExportPath(jobId),
      ]);

      if (statsResult.success && statsResult.data) {
        setExportStats(statsResult.data);
      }

      if (historyResult.success && historyResult.data) {
        setExportHistory(historyResult.data);
      }

      if (lastPathResult.success && lastPathResult.data) {
        setDestinationPath(lastPathResult.data.lastPath);
      }
    } catch (error) {
      console.error("Error loading export data:", error);
    }
  };

  const handleExport = async () => {
    if (!selectedBatch || !destinationPath) {
      toast.error("Please select a batch and specify destination path");
      return;
    }

    setIsExporting(true);

    try {
      const result = await exportApprovedImages(selectedBatch, destinationPath);

      if (result.success && result.data) {
        const { newlyExported, failedCount, message, errors } = result.data;

        if (message) {
          toast.info(message);
        } else if (failedCount && failedCount > 0) {
          toast.warning(
            `Exported ${newlyExported} images successfully, ${failedCount} failed. ${
              errors ? "Check console for errors." : ""
            }`
          );
          if (errors) {
            console.error("Export errors:", errors);
          }
        } else {
          toast.success(`Successfully exported ${newlyExported} new images!`);
        }

        // Reload export data to show updated stats and history
        await loadExportData(selectedBatch);

        // Only close dialog if there was actual export
        if (newlyExported > 0) {
          setIsDialogOpen(false);
          setDestinationPath("");
          setSelectedBatch(null);
        }
      } else {
        toast.error(result.error || "Failed to export images");
      }
    } catch (error) {
      console.error("Error exporting images:", error);
      toast.error("An error occurred while exporting images");
    } finally {
      setIsExporting(false);
    }
  };

  if (batches.length === 0) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-xl shadow-md p-12 text-center">
          <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            No Completed Batches
          </h2>
          <p className="text-slate-600">
            There are no completed batches available for export yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-xl shadow-md p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-6">
          Completed Batches
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                  Directory Path
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                  Total Images
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                  Processed
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                  Approved
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                  Created Date
                </th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-600">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr
                  key={batch.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                >
                  <td className="py-3 px-4 text-slate-700 font-mono text-xs max-w-xs truncate">
                    {batch.dirPath}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {batch.totalImages}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-700">{batch.processed}</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{
                            width: `${(batch.processed / batch.totalImages) * 100}%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-green-600 font-semibold">
                        {batch.approvedCount}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-500">
                    {new Date(batch.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <Dialog
                      open={isDialogOpen && selectedBatch === batch.id}
                      onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (open) {
                          setSelectedBatch(batch.id);
                        } else {
                          setSelectedBatch(null);
                          setDestinationPath("");
                          setExportHistory([]);
                          setExportStats(null);
                          setShowHistory(false);
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-green-50 hover:bg-green-100 border-green-200 text-green-600"
                          disabled={batch.approvedCount === 0}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Export
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Export Approved Images</DialogTitle>
                          <DialogDescription>
                            Export approved images from batch: {batch.dirPath.split(/[\\/]/).pop()}
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                          {/* Export Stats */}
                          {exportStats && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                              <p className="font-semibold text-blue-900 flex items-center gap-2 text-sm">
                                <Info className="w-4 h-4" />
                                Export Summary
                              </p>
                              <div className="space-y-1.5 text-sm text-blue-800">
                                <p className="flex items-center gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  <span className="font-semibold">{exportStats.newImages}</span> new approved images ready to export
                                </p>
                                <p className="flex items-center gap-2">
                                  <Download className="w-4 h-4 text-slate-500" />
                                  <span className="font-semibold">{exportStats.previouslyExported}</span> images already exported
                                </p>
                                <p className="flex items-center gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                                  <span className="font-semibold">{exportStats.totalApproved}</span> total approved images
                                </p>
                              </div>
                              {exportStats.newImages === 0 && (
                                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mt-2">
                                  <p className="text-xs text-amber-800 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    All approved images have already been exported. No new images to export.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Destination Input */}
                          <div className="space-y-2">
                            <Label htmlFor="destination" className="font-semibold">
                              Destination Folder Path
                            </Label>
                            <div className="relative">
                              <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <Input
                                id="destination"
                                type="text"
                                value={destinationPath}
                                onChange={(e) => setDestinationPath(e.target.value)}
                                placeholder="E:\Exported\ApprovedImages"
                                className="pl-10 h-11"
                              />
                            </div>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                              <Info className="w-3 h-3" />
                              The folder will be created if it doesn&apos;t exist
                            </p>
                          </div>

                          {/* Export History */}
                          {exportHistory.length > 0 && (
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setShowHistory(!showHistory)}
                                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                              >
                                <span className="font-semibold text-sm text-slate-700">
                                  Export History ({exportHistory.length} {exportHistory.length === 1 ? 'export' : 'exports'})
                                </span>
                                {showHistory ? (
                                  <ChevronUp className="w-4 h-4 text-slate-500" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-500" />
                                )}
                              </button>

                              {showHistory && (
                                <div className="border-t border-slate-200">
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                          <th className="p-2 text-left text-xs font-semibold text-slate-600">Date</th>
                                          <th className="p-2 text-left text-xs font-semibold text-slate-600">Exported By</th>
                                          <th className="p-2 text-right text-xs font-semibold text-slate-600">Count</th>
                                          <th className="p-2 text-left text-xs font-semibold text-slate-600">Destination</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {exportHistory.map((h) => (
                                          <tr key={h.id} className="hover:bg-slate-50">
                                            <td className="p-2 text-xs text-slate-700">
                                              {new Date(h.exportedAt).toLocaleDateString()} {new Date(h.exportedAt).toLocaleTimeString()}
                                            </td>
                                            <td className="p-2 text-xs text-slate-700">{h.exportedBy}</td>
                                            <td className="p-2 text-right">
                                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-md text-xs font-semibold">
                                                <Download className="w-3 h-3" />
                                                {h.exportedCount}
                                              </span>
                                            </td>
                                            <td className="p-2 text-xs text-slate-600 font-mono truncate max-w-[200px]" title={h.destinationPath}>
                                              {h.destinationPath}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Info Note */}
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                            <p className="text-xs text-slate-600 flex items-start gap-2">
                              <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                              <span>
                                Only newly approved images that haven&apos;t been exported will be copied. 
                                Previously exported images will be skipped automatically.
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsDialogOpen(false);
                              setDestinationPath("");
                              setSelectedBatch(null);
                            }}
                            className="flex-1"
                            disabled={isExporting}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleExport}
                            disabled={isExporting || !destinationPath || (exportStats?.newImages === 0)}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            {isExporting ? (
                              <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Exporting...
                              </span>
                            ) : (
                              <>
                                <Download className="w-4 h-4 mr-2" />
                                Export {exportStats?.newImages || 0} {exportStats?.newImages === 1 ? 'Image' : 'Images'}
                              </>
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
