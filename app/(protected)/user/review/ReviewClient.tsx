"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getCaptionsPage, submitReview } from "@/lib/actions/review.actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImageCaption {
  id: string;
  filePath: string;
  preCaption: string;
  postCaption: string | null;
  status: string;
  createdAt: Date;
}

interface Job {
  id: string;
  dirPath: string;
  totalImages: number;
  processed: number;
  reviewed: number;
  createdAt: Date;
}

interface ReviewClientProps {
  userId: string;
  jobs: Job[];
  initialJob: Job;
  initialData: {
    items: ImageCaption[];
    totalPending: number;
    page: number;
    pageSize: number;
  };
}

export default function ReviewClient({
  initialJob,
  initialData,
}: ReviewClientProps) {
  const [selectedJob, setSelectedJob] = useState<Job>(initialJob);
  const [captions, setCaptions] = useState<ImageCaption[]>(initialData.items);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPending, setTotalPending] = useState(initialData.totalPending);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [postCaption, setPostCaption] = useState(
    initialData.items[0]?.postCaption || initialData.items[0]?.preCaption || ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(false);

  const currentCaption = captions[selectedIndex];
  const totalPages = Math.ceil(totalPending / 10);

  useEffect(() => {
    if (currentCaption) {
      setPostCaption(currentCaption.postCaption || currentCaption.preCaption);
    }
  }, [selectedIndex, currentCaption]);

  const loadPage = async (page: number, jobId: string) => {
    setIsLoadingPage(true);
    try {
      const data = await getCaptionsPage(jobId, page, 10);
      setCaptions(data.items);
      setTotalPending(data.totalPending);
      setCurrentPage(page);
      setSelectedIndex(0);
      if (data.items.length > 0) {
        setPostCaption(data.items[0].postCaption || data.items[0].preCaption);
      }
    } catch (err) {
      toast.error("Failed to load images");
      console.error(err);
    } finally {
      setIsLoadingPage(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentCaption) return;
    setIsSubmitting(true);
    try {
      await submitReview(currentCaption.id, selectedJob.id, postCaption);
      toast.success("Review submitted successfully!");

      // Mark current item as reviewed locally and persist edited caption
      setCaptions((prev) => {
        const next = [...prev];
        const item = next[selectedIndex];
        if (item) {
          next[selectedIndex] = {
            ...item,
            status: "REVIEWED",
            postCaption,
          };
        }
        return next;
      });
      setTotalPending((t) => Math.max(0, t - 1));

      if (selectedIndex < captions.length - 1) {
        setSelectedIndex(selectedIndex + 1);
      } else {
        await loadPage(currentPage, selectedJob.id);
      }
    } catch (err) {
      toast.error("Failed to submit review");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      loadPage(currentPage + 1, selectedJob.id);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      loadPage(currentPage - 1, selectedJob.id);
    }
  };

  if (!currentCaption) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-bold text-neutral-900">All Done!</h2>
          <p className="text-neutral-600">
            You&apos;ve reviewed all images in this batch.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Review Images
              </h1>
              <p className="text-sm text-muted-foreground">
                {selectedJob.dirPath}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-neutral-600">
                Page {currentPage + 1} of {totalPages} • {totalPending} pending
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevPage}
                  disabled={currentPage === 0 || isLoadingPage}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages - 1 || isLoadingPage}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Thumbnails */}
        <div className="w-80 border-r border-neutral-200 bg-white overflow-y-auto">
          <div className="p-4 space-y-2">
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">
              Images ({captions.length})
            </h3>
            {isLoadingPage ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              captions.map((caption, idx) => (
                <button
                  key={caption.id}
                  onClick={() => setSelectedIndex(idx)}
                  className={cn(
                    "w-full rounded-lg overflow-hidden border-2 transition-all hover:border-blue-400",
                    selectedIndex === idx
                      ? "border-blue-600 ring-2 ring-blue-200"
                      : "border-neutral-200"
                  )}
                >
                  <div className="relative aspect-video bg-neutral-100">
                    <Image
                      src={`/api/file?path=${encodeURIComponent(
                        caption.filePath
                      )}`}
                      alt={`${idx + 1}`}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                    {caption.status === "REVIEWED" && (
                      <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-green-600 text-white px-2 py-0.5 text-[10px] font-medium shadow-sm">
                        <CheckCircle2 className="w-3 h-3" /> Reviewed
                      </span>
                    )}
                  </div>
                  <div className="p-2 bg-white">
                    <p className="text-xs text-neutral-600 truncate">
                      Image {idx + 1}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 flex">
            {/* Large Preview */}
            <div className="flex-1 bg-neutral-50 flex items-center justify-center p-8">
              <div className="relative w-full h-full max-w-4xl max-h-full">
                <Image
                  src={`/api/file?path=${encodeURIComponent(
                    currentCaption.filePath
                  )}`}
                  alt="Preview"
                  fill
                  className="object-contain"
                  unoptimized
                  priority
                />
                {currentCaption.status === "REVIEWED" && (
                  <div className="absolute top-4 left-4 inline-flex items-center gap-2 rounded-full bg-green-600/90 text-white px-3 py-1 text-xs font-medium shadow">
                    <CheckCircle2 className="w-4 h-4" /> Reviewed
                  </div>
                )}
              </div>
            </div>

            {/* Caption Editor */}
            <div className="w-[400px] border-l border-neutral-200 bg-white flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Pre-Caption */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-neutral-900">
                    Pre-Caption (Generated)
                  </Label>
                  <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                      {currentCaption.preCaption}
                    </p>
                  </div>
                </div>

                {/* Post-Caption */}
                <div className="space-y-2">
                  <Label
                    htmlFor="postCaption"
                    className="text-sm font-semibold text-neutral-900"
                  >
                    Post-Caption (Editable)
                  </Label>
                  <Textarea
                    id="postCaption"
                    value={postCaption}
                    onChange={(e) => setPostCaption(e.target.value)}
                    placeholder="Edit the caption..."
                    className="min-h-[200px] resize-none"
                  />
                  <p className="text-xs text-neutral-500">
                    {postCaption.length} characters
                  </p>
                </div>
              </div>

              {/* Submit Button */}
              <div className="p-6 border-t border-neutral-200">
                <Button
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting ||
                    !postCaption.trim() ||
                    currentCaption.status === "REVIEWED"
                  }
                  className="w-full bg-blue-600 hover:bg-blue-700 font-medium"
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {currentCaption.status === "REVIEWED"
                        ? "Already Reviewed"
                        : "Submit Review"}
                    </>
                  )}
                </Button>
                <div className="mt-2 text-xs text-center text-neutral-500">
                  {selectedIndex + 1} of {captions.length} in current page
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
