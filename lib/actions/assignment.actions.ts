"use server";

import { Prisma } from "@prisma/client";
import prisma from "../prisma";
import { revalidatePath } from "next/cache";

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

export async function getUserBatchOverview(jobId: string) {
  if (!jobId) return { success: false, error: "jobId is required" };

  try {
    const job = await prisma.imageJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        processed: true,
        assignedUser: { select: { name: true, email: true } },
      },
    });

    if (!job) {
      return { success: false, error: "No jobs found" };
    }

    const processed = job.processed || 0;

    const whereBase: Prisma.ImageCaptionWhereInput = { jobId };

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
    revalidatePath(`/admin/assign/${jobId}`);

    return {
      success: true,
      data: { approved, reviewed, captioned, left, user: job.assignedUser },
    };
  } catch (err) {
    console.log("Error approving caption:", err);
    return { success: false, error: "Error approving caption" };
  }
}

export async function getProcessedCaptionsForUser(jobId: string) {
  if (!jobId) return { success: false, error: "jobId is required" };

  try {
    const where: Prisma.ImageCaptionWhereInput = {
      jobId,
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

    revalidatePath("/admin/assign");
    revalidatePath(`/admin/assign/${jobId}`);

    return { success: true, data: itemsRaw };
  } catch (err) {
    console.error("Error fetching processed captions:", err);
    return { success: false, error: "Error fetching processed captions" };
  }
}

export async function getProcessedCaptionsPage(
  jobId: string,
  page = 1,
  pageSize = 70,
  statusFilter?: "CAPTIONED" | "REVIEWED" | "APPROVED" | null
) {
  if (!jobId) return { success: false, error: "jobId is required" };

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(Number(pageSize) || 70, 100));
  const skip = (safePage - 1) * safePageSize;

  try {
    const where: Prisma.ImageCaptionWhereInput = { jobId };
    if (statusFilter) {
      where.status = statusFilter;
    }

    const [totalCount, items] = await Promise.all([
      prisma.imageCaption.count({ where }),
      prisma.imageCaption.findMany({
        where,
        orderBy: { createdAt: "asc" },
        skip,
        take: safePageSize,
        select: {
          id: true,
          filePath: true,
          preCaption: true,
          postCaption: true,
          status: true,
          jobId: true,
          createdAt: true,
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));

    return {
      success: true,
      data: {
        items,
        totalCount,
        totalPages,
        page: safePage,
        pageSize: safePageSize,
      },
    };
  } catch (err) {
    console.error("Error fetching paginated captions:", err);
    return { success: false, error: "Failed to fetch captions" };
  }
}

export async function approveCaption(captionId: string) {
  if (!captionId) return { success: false, error: "captionId is required" };

  try {
    const res = await prisma.imageCaption.update({
      where: { id: captionId },
      data: { status: "APPROVED" },
    });

    if (!res) {
      return { success: false, error: "Caption approval failed" };
    }

    revalidatePath("/admin/assign");
    revalidatePath(`/admin/assign/${res.jobId}`);

    return { success: true, data: res };
  } catch (err) {
    console.log("Error approving caption:", err);
    return { success: false, error: "Error approving caption" };
  }
}

export async function rejectCaption(captionId: string) {
  if (!captionId) return { success: false, error: "captionId is required" };

  try {
    const res = await prisma.imageCaption.update({
      where: { id: captionId },
      data: { status: "CAPTIONED" },
    });

    if (!res) {
      return { success: false, error: "Caption rejection failed" };
    }

    revalidatePath("/admin/assign");
    revalidatePath(`/admin/assign/${res.jobId}`);

    return { success: true, data: res };
  } catch (err) {
    console.log("Error rejecting caption:", err);
    return { success: false, error: "Error rejecting caption" };
  }
}

// --- CSV Export helpers ---
function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map((v) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(",");
}

// Export all captions for a job: filePath, preCaption, postCaption, reviewedBy
export async function exportAllCaptions(jobId: string) {
  try {
    if (!jobId) return { success: false, error: "jobId is required" } as const;

    const captions = await prisma.imageCaption.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
      select: {
        filePath: true,
        preCaption: true,
        postCaption: true,
        reviewer: { select: { name: true, email: true } },
      },
    });

    const header = "filePath,preCaption,postCaption,reviewedBy";
    const rows = captions.map((c) =>
      toCsvRow([
        c.filePath,
        c.preCaption || "",
        c.postCaption || "",
        c.reviewer?.name || c.reviewer?.email || "",
      ])
    );
    const csv = [header, ...rows].join("\n");

    return { success: true, data: csv } as const;
  } catch (err) {
    console.error("exportAllCaptions error", err);
    return { success: false, error: "Failed to export captions" } as const;
  }
}

export async function exportReviewedCaptions(jobId: string) {
  try {
    if (!jobId) return { success: false, error: "jobId is required" } as const;

    const captions = await prisma.imageCaption.findMany({
      where: { jobId, status: "REVIEWED" },
      orderBy: { createdAt: "asc" },
      select: {
        filePath: true,
        preCaption: true,
        postCaption: true,
        reviewer: { select: { name: true, email: true } },
      },
    });

    const header = "filePath,preCaption,postCaption,reviewedBy";
    const rows = captions.map((c) =>
      toCsvRow([
        c.filePath,
        c.preCaption ?? "",
        c.postCaption ?? "",
        c.reviewer?.name || c.reviewer?.email || "",
      ])
    );
    const csv = [header, ...rows].join("\n");

    return { success: true, data: csv } as const;
  } catch (err) {
    console.error("exportReviewedCaptions error", err);
    return { success: false, error: "Failed to export reviewed captions" } as const;
  }
}

export async function approveAll(jobId: string) {
  if (!jobId) return { success: false, error: "jobId is required" };

  try {
    const res = await prisma.imageCaption.updateMany({
      where: { jobId, status: "REVIEWED" },
      data: { status: "APPROVED" },
    });

    if (!res) {
      return { success: false, error: "All approval failed" };
    }

    revalidatePath("/admin/assign");
    revalidatePath(`/admin/assign/${jobId}`);

    return { success: true, data: res };
  } catch (err) {
    console.log("Error approving caption:", err);
    return { success: false, error: "Error approving caption" };
  }
}

export async function approveCaptionsBulk(captionIds: string[]) {
  if (!captionIds?.length) {
    return { success: false, error: "No captions selected" };
  }

  try {
    const res = await prisma.imageCaption.updateMany({
      where: { id: { in: captionIds } },
      data: { status: "APPROVED" },
    });

    revalidatePath("/admin/assign");
    // Revalidate each job affected - find distinct job IDs
    const jobs = await prisma.imageCaption.findMany({
      where: { id: { in: captionIds } },
      select: { jobId: true },
      distinct: ["jobId"],
    });
    for (const job of jobs) {
      if (job.jobId) {
        revalidatePath(`/admin/assign/${job.jobId}`);
      }
    }

    return { success: true, data: res };
  } catch (err) {
    console.error("Error approving selected captions:", err);
    return { success: false, error: "Failed to approve selected captions" };
  }
}

