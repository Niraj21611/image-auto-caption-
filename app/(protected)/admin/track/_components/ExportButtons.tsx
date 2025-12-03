"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  exportAllCaptions,
  exportReviewedCaptions,
} from "@/lib/actions/assignment.actions";
import { toast } from "sonner";

interface ExportButtonsProps {
  jobId: string;
  totalImages: number;
  reviewed: number;
}

async function downloadXlsx(filename: string, base64: string) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportButtons({
  jobId,
  totalImages,
  reviewed,
}: ExportButtonsProps) {
  const [loading, setLoading] = useState(false);

  const allReviewed = totalImages > 0 && reviewed === totalImages;
  const noReviewed = reviewed === 0;

  const handleExportAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      // Always export all images; fields may be blank if not reviewed
      const res = await exportAllCaptions(jobId);

      if (!res.success || !res.data) {
        toast.error(res.error || "Failed to export");
        return;
      }
      await downloadXlsx(
        `jobId${jobId}_${allReviewed ? "reviewed" : "all"}.xlsx`,
        res.data,
      );
      toast.success("Export successful");
    } catch (err) {
      console.error("Export all error", err);
      toast.error("Failed to export");
    } finally {
      setLoading(false);
    }
  };

  const handleExportReviewed = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const res = await exportReviewedCaptions(jobId);
      if (!res.success || !res.data) {
        toast.error(res.error || "Failed to export reviewed");
        return;
      }
      await downloadXlsx(
        `jobId${jobId}_reviewed.xlsx`,
        res.data,
      );
      toast.success("Export successful");
    } catch (err) {
      console.error("Export reviewed error", err);
      toast.error("Failed to export reviewed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {<Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={handleExportAll}
      >
        {loading ? "Exporting..." : "Export All"}
      </Button>}
      <Button
        size="sm"
        variant="outline"
        disabled={loading || noReviewed}
        onClick={handleExportReviewed}
      >
        {loading ? "Exporting..." : "Export Reviewed"}
      </Button>
    </div>
  );
}
