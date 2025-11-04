"use server";

import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { revalidatePath } from "next/cache";
import * as fsp from "node:fs/promises";
import path from "node:path";

// Contract
// - listCompletedJobs(): jobs ready to assign (COMPLETED or processed>=total)
// - listUsers(): reviewers to assign to (role USER)
// - assignJobAction(FormData): assign a job to a user (server action via <form>)
// - getUserReviewStats(userId): totals for reviewed and pending for that user

export async function listCompletedJobs() {
  // Return most recent first, include assigned user info for UI label
  const jobs = await prisma.imageJob.findMany({
    where: { status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      dirPath: true,
      totalImages: true,
      processed: true,
      reviewed: true,
      status: true,
      assignedTo: true,
      assignedUser: { select: { id: true, name: true, email: true } },
      createdAt: true,
    },
  });
  return jobs;
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    where: { role: "USER" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true },
  });
  return users;
}

export async function assignJob(jobId: string, userId: string) {
  if (!jobId || !userId) throw new Error("jobId and userId are required");
  // Ensure both exist
  const [job, user] = await Promise.all([
    prisma.imageJob.findUnique({ where: { id: jobId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
  ]);
  if (!job) throw new Error("Job not found");
  if (!user) throw new Error("User not found");

  await prisma.imageJob.update({
    where: { id: jobId },
    data: { assignedTo: userId },
  });
}

// Form-bound server action for <form action={assignJobAction}>
export async function assignJobAction(formData: FormData) {
  const jobId = String(formData.get("jobId") || "").trim();
  const userId = String(formData.get("userId") || "").trim();
  await assignJob(jobId, userId);
  // Revalidate both list and the user's detail page
  revalidatePath("/admin/assign");
  if (userId) revalidatePath(`/admin/assign/${userId}`);
}

export async function getUserReviewStats(userId: string) {
  if (!userId) throw new Error("userId is required");
  const jobs = await prisma.imageJob.findMany({
    where: { assignedTo: userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      dirPath: true,
      totalImages: true,
      processed: true,
      reviewed: true,
      status: true,
      createdAt: true,
      assignedUser: {
        select: { name: true, email: true },
      },
    },
  });
  console.log("User review jobs:", jobs);
  let reviewed = 0;
  let pending = 0;
  for (const j of jobs) {
    reviewed += j.reviewed || 0;
    const toReview = Math.max(0, (j.processed || 0) - (j.reviewed || 0));
    pending += toReview;
  }
  return { reviewed, pending, jobs };
}

// --- Admin approval workflow helpers ---

function mimeFromExt(ext: string) {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function filePathToDataUrl(filePath: string) {
  try {
    const buf = await fsp.readFile(filePath);
    const ext = path.extname(filePath);
    const mime = mimeFromExt(ext);
    const base64 = buf.toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch {
    return "data:application/octet-stream;base64,";
  }
}

export async function getUserBatchOverview(userId: string, jobId?: string) {
  if (!userId) return { success: false, error: "userId are required" };

  try {
    const jobs = await prisma.imageJob.findMany({
      where: jobId ? { id: jobId, assignedTo: userId } : { assignedTo: userId },
      select: { id: true, processed: true },
    });

    if (!jobs) {
      return { success: false, error: "No jobs found" };
    }

    const processed = jobs.reduce((acc, j) => acc + (j.processed || 0), 0);

    const whereBase: Prisma.ImageCaptionWhereInput = jobId
      ? { jobId, Job: { assignedTo: userId } }
      : { Job: { assignedTo: userId } };

    const [approved, reviewed, captioned] = await Promise.all([
      prisma.imageCaption.count({
        where: { ...whereBase, status: "APPROVED" },
      }),
      prisma.imageCaption.count({
        where: { ...whereBase, status: "REVIEWED" },
      }),
      prisma.imageCaption.count({
        where: { ...whereBase, status: "CAPTIONED" },
      }),
    ]);

    const left = Math.max(0, processed - approved);

    revalidatePath("/admin/assign");
    revalidatePath(`/admin/assign/${userId}`);

    return { success: true, data: { approved, reviewed, captioned, left } };
  } catch (err) {
    console.log("Error approving caption:", err);
    return { success: false, error: "Error approving caption" };
  }
}

export async function getProcessedCaptionsForUser(
  userId: string,
  jobId?: string
) {
  if (!userId) return { success: false, error: "userId is required" };

  try {
    const where: Prisma.ImageCaptionWhereInput = {
      status: { in: ["CAPTIONED", "REVIEWED"] },
      Job: { assignedTo: userId },
      ...(jobId ? { jobId } : {}),
    };

    const itemsRaw = await prisma.imageCaption.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        filePath: true,
        preCaption: true,
        postCaption: true,
        status: true,
        jobId: true,
        createdAt: true,
      },
    });

    const items = await Promise.all(
      itemsRaw.map(async (it) => ({
        ...it,
        src: await filePathToDataUrl(it.filePath),
      }))
    );

    revalidatePath("/admin/assign");
    revalidatePath(`/admin/assign/${userId}`);

    return { success: true, data: items };
  } catch (err) {
    console.error("Error fetching processed captions:", err);
    return { success: false, error: "Error fetching processed captions" };
  }
}

export async function approveCaption(captionId: string, userId: string) {
  if (!captionId || !userId)
    return { success: false, error: "captionId and userId are required" };

  try {
    const res = await prisma.imageCaption.update({
      where: { id: captionId },
      data: { status: "APPROVED" },
    });

    if (!res) {
      return { success: false, error: "Caption approval failed" };
    }

    revalidatePath("/admin/assign");
    revalidatePath(`/admin/assign/${userId}`);

    return { success: true, caption: res };
  } catch (err) {
    console.log("Error approving caption:", err);
    return { success: false, error: "Error approving caption" };
  }
}

export async function rejectCaption(captionId: string, userId: string) {
  if (!captionId || !userId)
    return { success: false, error: "captionId and userId are required" };

  try {
    const res = await prisma.imageCaption.update({
      where: { id: captionId },
      data: { status: "CAPTIONED" },
    });

    if (!res) {
      return { success: false, error: "Caption rejection failed" };
    }

    revalidatePath("/admin/assign");
    revalidatePath(`/admin/assign/${userId}`);

    return { success: true, caption: res };
  } catch (err) {
    console.log("Error rejecting caption:", err);
    return { success: false, error: "Error rejecting caption" };
  }
}

export async function approveAll(userId: string, jobId: string) {
  if (!jobId || !userId)
    return { success: false, error: "jobId and userId are required" };

  try {
    const res = await prisma.imageCaption.updateMany({
      where: { jobId, status: { in: ["CAPTIONED", "REVIEWED"] } },
      data: { status: "APPROVED" },
    });

    if (!res) {
      return { success: false, error: "All approval failed" };
    }

    revalidatePath("/admin/assign");
    revalidatePath(`/admin/assign/${userId}`);

    return { success: true, caption: res };
  } catch (err) {
    console.log("Error approving caption:", err);
    return { success: false, error: "Error approving caption" };
  }
}

export async function getUserData(userId: string, jobId: string) {
  if (!userId) throw new Error("userId is required");
  if (!jobId) throw new Error("jobId is required");
  const [user, overview, captions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    }),
    getUserBatchOverview(userId, jobId),
    getProcessedCaptionsForUser(userId, jobId),
  ]);
  return { user, overview, captions };
}
