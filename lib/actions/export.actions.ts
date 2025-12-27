"use server";

import prisma from "../prisma";
import fs from "fs/promises";
import path from "path";
import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";

export async function getCompletedBatches() {
  try {
    const batches = await prisma.imageJob.findMany({
      where: {
        status: "COMPLETED",
      },
      select: {
        id: true,
        dirPath: true,
        totalImages: true,
        processed: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            ImageCaption: {
              where: {
                status: "APPROVED",
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedBatches = batches.map((batch) => ({
      id: batch.id,
      dirPath: batch.dirPath,
      totalImages: batch.totalImages,
      processed: batch.processed,
      approvedCount: batch._count.ImageCaption,
      status: batch.status,
      createdAt: batch.createdAt,
    }));

    return { success: true, data: formattedBatches };
  } catch (error) {
    console.error("Error fetching completed batches:", error);
    return { success: false, error: "Failed to fetch completed batches" };
  }
}

export async function getExportHistory(jobId: string) {
  try {
    const session = await getServerSession(nextauthOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    if (!jobId) {
      return { success: false, error: "Job ID is required" };
    }

    const history = await prisma.exportHistory.findMany({
      where: { jobId },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
      orderBy: { exportedAt: "desc" },
      take: 10, // Last 10 exports
    });

    return {
      success: true,
      data: history.map((h) => ({
        id: h.id,
        destinationPath: h.destinationPath,
        exportedCount: h.exportedCount,
        exportedAt: h.exportedAt,
        exportedBy: h.user.name || h.user.email,
      })),
    };
  } catch (error) {
    console.error("Error fetching export history:", error);
    return { success: false, error: "Failed to fetch export history" };
  }
}

export async function getExportStats(jobId: string) {
  try {
    const session = await getServerSession(nextauthOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    if (!jobId) {
      return { success: false, error: "Job ID is required" };
    }

    const [newImages, previouslyExported, totalApproved] = await Promise.all([
      // Count approved images that haven't been exported
      prisma.imageCaption.count({
        where: {
          jobId,
          status: "APPROVED",
          isExported: false,
        },
      }),
      // Count approved images that have been exported
      prisma.imageCaption.count({
        where: {
          jobId,
          status: "APPROVED",
          isExported: true,
        },
      }),
      // Total approved
      prisma.imageCaption.count({
        where: {
          jobId,
          status: "APPROVED",
        },
      }),
    ]);

    return {
      success: true,
      data: {
        newImages,
        previouslyExported,
        totalApproved,
      },
    };
  } catch (error) {
    console.error("Error fetching export stats:", error);
    return { success: false, error: "Failed to fetch export stats" };
  }
}

export async function getLastExportPath(jobId: string) {
  try {
    const session = await getServerSession(nextauthOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    if (!jobId) {
      return { success: false, error: "Job ID is required" };
    }

    // Get the most recent export for this batch
    const lastExport = await prisma.exportHistory.findFirst({
      where: { jobId },
      orderBy: { exportedAt: "desc" },
      select: { destinationPath: true },
    });

    return {
      success: true,
      data: {
        lastPath: lastExport?.destinationPath || "",
      },
    };
  } catch (error) {
    console.error("Error fetching last export path:", error);
    return { success: false, error: "Failed to fetch last export path" };
  }
}

export async function exportApprovedImages(jobId: string, destinationPath: string) {
  try {
    // Check authorization
    const session = await getServerSession(nextauthOptions);
    if (!session?.user || session.user.role !== "ADMIN") {
      return { success: false, error: "Unauthorized" };
    }

    if (!jobId || !destinationPath) {
      return { success: false, error: "Missing required fields" };
    }

    // Get the job with approved captions that haven't been exported yet
    const job = await prisma.imageJob.findUnique({
      where: { id: jobId },
      include: {
        ImageCaption: {
          where: {
            status: "APPROVED",
            isExported: false, // Only get images that haven't been exported
          },
          select: {
            id: true,
            filePath: true,
          },
        },
      },
    });

    if (!job) {
      return { success: false, error: "Batch not found" };
    }

    const approvedImages = job.ImageCaption;

    if (approvedImages.length === 0) {
      return {
        success: true,
        data: {
          newlyExported: 0,
          message: "No new images to export. All approved images have already been exported.",
        },
      };
    }

    // Create destination directory if it doesn't exist
    try {
      await fs.mkdir(destinationPath, { recursive: true });
    } catch (error) {
      console.error("Error creating destination directory:", error);
      return { success: false, error: "Failed to create destination directory" };
    }

    // Copy each approved image
    let copiedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const exportedImageIds: string[] = [];

    for (const caption of approvedImages) {
      try {
        const sourcePath = caption.filePath;
        const fileName = path.basename(sourcePath);
        const destFilePath = path.join(destinationPath, fileName);

        // Check if source file exists
        try {
          await fs.access(sourcePath);
        } catch {
          errors.push(`Source file not found: ${fileName}`);
          failedCount++;
          continue;
        }

        // Copy file
        await fs.copyFile(sourcePath, destFilePath);
        copiedCount++;
        exportedImageIds.push(caption.id);
      } catch (error) {
        console.error(`Error copying file ${caption.filePath}:`, error);
        errors.push(`Failed to copy: ${path.basename(caption.filePath)}`);
        failedCount++;
      }
    }

    // Update database: mark images as exported and create export history
    if (copiedCount > 0) {
      await prisma.$transaction([
        // Mark images as exported
        prisma.imageCaption.updateMany({
          where: {
            id: { in: exportedImageIds },
          },
          data: {
            isExported: true,
            exportedAt: new Date(),
          },
        }),
        // Create export history record
        prisma.exportHistory.create({
          data: {
            jobId,
            destinationPath,
            exportedCount: copiedCount,
            exportedBy: session.user.id,
            imageIds: exportedImageIds,
          },
        }),
      ]);
    }

    return {
      success: true,
      data: {
        newlyExported: copiedCount,
        failedCount,
        totalApproved: approvedImages.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  } catch (error) {
    console.error("Error exporting approved images:", error);
    return { success: false, error: "Failed to export images" };
  }
}
