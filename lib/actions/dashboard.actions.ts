"use server";

import prisma from "../prisma";

export async function getAdminDashboardStats() {
  try {
    // Total users
    const totalUsers = await prisma.user.count({
      where: { role: "USER" },
    });

    // Currently online users (based on isCheckedIn flag)
    const currentlyOnline = await prisma.user.count({
      where: {
        role: "USER",
        isCheckedIn: true,
      },
    });

    // Total batches processed
    const totalBatches = await prisma.imageJob.count();

    // Running batches
    const runningBatches = await prisma.imageJob.count({
      where: {
        status: { in: ["RUNNING", "READY"] },
      },
    });

    // Completed batches
    const completedBatches = await prisma.imageJob.count({
      where: {
        status: "COMPLETED",
      },
    });

    // Failed batches
    const failedBatches = await prisma.imageJob.count({
      where: {
        status: "FAILED",
      },
    });

    // Assigned batches
    const assignedBatches = await prisma.imageJob.count({
      where: {
        assignedTo: { not: null },
      },
    });

    // Unassigned batches
    const unassignedBatches = await prisma.imageJob.count({
      where: {
        assignedTo: null,
      },
    });

    // Total images processed
    const imageStats = await prisma.imageJob.aggregate({
      _sum: {
        processed: true,
        totalImages: true,
        failed: true,
      },
    });

    // Recent batches (last 5)
    const recentBatches = await prisma.imageJob.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        dirPath: true,
        status: true,
        totalImages: true,
        processed: true,
        failed: true,
        assignedUser: {
          select: {
            name: true,
            email: true,
          },
        },
        createdAt: true,
      },
    });

    return {
      success: true,
      data: {
        totalUsers,
        currentlyOnline,
        totalBatches,
        runningBatches,
        completedBatches,
        failedBatches,
        assignedBatches,
        unassignedBatches,
        totalImagesProcessed: imageStats._sum.processed || 0,
        totalImages: imageStats._sum.totalImages || 0,
        totalImagesFailed: imageStats._sum.failed || 0,
        recentBatches,
      },
    };
  } catch (err) {
    console.error("Error fetching admin dashboard stats:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg || "Failed to fetch admin stats" };
  }
}

export async function getUserDashboardStats(userId: string) {
  try {
    if (!userId) {
      return { success: false, error: "User ID is required" };
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Total attendance (days worked)
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(startOfDay.getDate() + 1);

    const attendanceDays = await prisma.userActivity.findMany({
      where: {
        userId,
      },
      select: {
        date: true,
      },
      distinct: ["date"],
    });

    const totalAttendanceDays = attendanceDays.length;

    // Today's attendance duration
    const todayActivities = await prisma.userActivity.findMany({
      where: {
        userId,
        checkInAt: { lt: endOfDay },
        OR: [
          { checkOutAt: null },
          { checkOutAt: { gt: startOfDay } },
        ],
      },
      select: {
        checkInAt: true,
        checkOutAt: true,
      },
    });

    let todayMinutes = 0;
    for (const act of todayActivities) {
      const start = act.checkInAt < startOfDay ? startOfDay : act.checkInAt;
      const rawEnd = act.checkOutAt ?? now;
      const end = rawEnd > endOfDay ? endOfDay : rawEnd;
      const diff = Math.max(0, end.getTime() - start.getTime());
      todayMinutes += Math.floor(diff / 60000);
    }

    const formatDuration = (totalMinutes: number): string => {
      const minutes = Math.max(0, Math.floor(totalMinutes));
      if (minutes < 60) return `${minutes} min${minutes !== 1 ? "s" : ""}`;
      const hrs = Math.floor(minutes / 60);
      const mins = minutes % 60;
      if (mins === 0) return `${hrs} hr${hrs !== 1 ? "s" : ""}`;
      return `${hrs} hr${hrs !== 1 ? "s" : ""} ${mins} min${mins !== 1 ? "s" : ""}`;
    };

    // Assigned batches
    const assignedBatches = await prisma.imageJob.findMany({
      where: {
        assignedTo: userId,
      },
      select: {
        id: true,
        dirPath: true,
        status: true,
        totalImages: true,
        processed: true,
        reviewed: true,
        failed: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Total images processed by this user
    const processedImages = await prisma.imageCaption.count({
      where: {
        reviewerId: userId,
        status: { in: ["REVIEWED", "APPROVED"] },
      },
    });

    // Currently assigned batches count
    const currentlyAssigned = assignedBatches.filter((b) =>
      ["RUNNING", "READY"].includes(b.status)
    ).length;

    // Completed batches count
    const completedBatches = assignedBatches.filter(
      (b) => b.status === "COMPLETED"
    ).length;

    // Images pending review
    const pendingReview = await prisma.imageCaption.count({
      where: {
        jobId: { in: assignedBatches.map((b) => b.id) },
        status: "CAPTIONED",
      },
    });

    return {
      success: true,
      data: {
        user,
        totalAttendanceDays,
        todayMinutes,
        todayFormatted: formatDuration(todayMinutes),
        processedImages,
        currentlyAssigned,
        completedBatches,
        pendingReview,
        assignedBatches,
      },
    };
  } catch (err) {
    console.error("Error fetching user dashboard stats:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg || "Failed to fetch user stats" };
  }
}
