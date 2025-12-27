"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, FolderOpen, CheckCircle2, AlertCircle } from "lucide-react";
import { exportApprovedImages } from "@/lib/actions/export.actions";
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

export default function ExportBatchesClient({ batches }: ExportBatchesClientProps) {
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [destinationPath, setDestinationPath] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleExport = async () => {
    if (!selectedBatch || !destinationPath) {
      toast.error("Please select a batch and specify destination path");
      return;
    }

    setIsExporting(true);

    try {
      const result = await exportApprovedImages(selectedBatch, destinationPath);

      if (result.success && result.data) {
        const { copiedCount, failedCount, errors } = result.data;
        
        if (failedCount > 0) {
          toast.warning(
            `Exported ${copiedCount} images successfully, ${failedCount} failed. ${
              errors ? "Check console for errors." : ""
            }`
          );
          if (errors) {
            console.error("Export errors:", errors);
          }
        } else {
          toast.success(`Successfully exported ${copiedCount} images!`);
        }
        
        setIsDialogOpen(false);
        setDestinationPath("");
        setSelectedBatch(null);
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
                      <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                          <DialogTitle>Export Approved Images</DialogTitle>
                          <DialogDescription>
                            Export {batch.approvedCount} approved images from this batch
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="destination">
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
                                className="pl-10"
                              />
                            </div>
                            <p className="text-xs text-slate-500">
                              The folder will be created if it doesn&apos;t exist
                            </p>
                          </div>

                          <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Batch:</span>
                              <span className="font-mono text-xs text-slate-700">
                                {batch.dirPath.split(/[\\/]/).pop()}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Approved Images:</span>
                              <span className="font-semibold text-green-600">
                                {batch.approvedCount}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setIsDialogOpen(false);
                              setDestinationPath("");
                            }}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleExport}
                            disabled={isExporting || !destinationPath}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            {isExporting ? (
                              "Exporting..."
                            ) : (
                              <>
                                <Download className="w-4 h-4 mr-2" />
                                Export Images
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
