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

    // Get the job with approved captions
    const job = await prisma.imageJob.findUnique({
      where: { id: jobId },
      include: {
        ImageCaption: {
          where: {
            status: "APPROVED",
          },
          select: {
            filePath: true,
          },
        },
      },
    });

    if (!job) {
      return { success: false, error: "Batch not found" };
    }

    if (job.ImageCaption.length === 0) {
      return { success: false, error: "No approved images found in this batch" };
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

    for (const caption of job.ImageCaption) {
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
      } catch (error) {
        console.error(`Error copying file ${caption.filePath}:`, error);
        errors.push(`Failed to copy: ${path.basename(caption.filePath)}`);
        failedCount++;
      }
    }

    return {
      success: true,
      data: {
        copiedCount,
        failedCount,
        totalApproved: job.ImageCaption.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  } catch (error) {
    console.error("Error exporting approved images:", error);
    return { success: false, error: "Failed to export images" };
  }
}
