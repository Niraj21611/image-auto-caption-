"use server";

import prisma from "../prisma";
import { Prisma } from "@prisma/client";

export async function createUser(
  email: string,
  password: string,
  name: string
) {
  try {
    const res = await prisma.user.create({
      data: {
        email,
        password,
        name,
      },
    });

    if (!res) {
      return { success: false, error: "User creation failed" };
    }

    return { success: true, user: res };
  } catch {
    console.log("Error creating user");
    return { success: false, error: "Error creating user" };
  }
}

export async function deleteUserById(userId: string) {
  try {
    const res = await prisma.user.delete({
      where: {
        id: userId,
      },
    });

    if (!res) {
      return { success: false, error: "User deletion failed" };
    }

    return { success: true };
  } catch {
    return { success: false, error: "Error deleting user" };
  }
}

export async function updateUser(
  userId: string,
  data: Partial<{
    name: string;
    email: string;
    password: string;
  }>
) {
  try {
    const res = await prisma.user.update({
      where: { id: userId },
      data,
    });

    if (!res) {
      return { success: false, error: "User update failed" };
    }

    return { success: true, user: res };
  } catch (error) {
    console.error("Error updating user:", error);
    return { success: false, error: "Error updating user" };
  }
}

export async function getAllUsers() {
  try {
    const users = await prisma.user.findMany({ where: { role: "USER" } });
    if (!users) {
      return { success: false, error: "No users found" };
    }
    return { success: true, data: users };
  } catch (err) {
    console.error("Error fetching users:", err);
    return { success: false, error: "Error fetching users" };
  }
}

export async function changePassword(newPassword: string, userId: string) {
  try {
    const res = await prisma.user.update({
      where: { id: userId },
      data: { password: newPassword },
    });

    if (!res) {
      return { success: false, error: "Password change failed" };
    }
    return { success: true };
  } catch (err) {
    console.error("Error changing password:", err);
    return { success: false, error: "Error changing password" };
  }
}

// Helper to format minutes as requested
function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr` + (hrs > 1 ? "s" : "");
  return `${hrs} hr${hrs > 1 ? "s" : ""} ${mins} mins`;
}

// Compute today's total logged-in duration per user, handling ongoing sessions (logoutAt null)
export async function getUsersTodayDurations(userIds: string[]) {
  try {
    if (!userIds || userIds.length === 0) return { success: true, data: {} as Record<string, { minutes: number; formatted: string }> };

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(startOfDay.getDate() + 1);

    // Fetch activities that overlap today for the provided users
    const activities = await prisma.userActivity.findMany({
      where: {
        userId: { in: userIds },
        loginAt: { lt: endOfDay },
        OR: [
          { logoutAt: null },
          { logoutAt: { gt: startOfDay } },
          { logoutAt: { isSet: false } as any },
        ],
      },
      select: {
        userId: true,
        loginAt: true,
        logoutAt: true,
      },
      orderBy: { loginAt: "asc" },
    });

    const totals = new Map<string, number>();
    for (const act of activities) {
      const start = act.loginAt < startOfDay ? startOfDay : act.loginAt;
      const rawEnd = act.logoutAt ?? now;
      const end = rawEnd > endOfDay ? endOfDay : rawEnd;
      const diff = Math.max(0, end.getTime() - start.getTime());
      const mins = Math.floor(diff / 60000);
      totals.set(act.userId, (totals.get(act.userId) || 0) + mins);
    }

    const result: Record<string, { minutes: number; formatted: string }> = {};
    for (const id of userIds) {
      const mins = totals.get(id) || 0;
      result[id] = { minutes: mins, formatted: formatDuration(mins) };
    }

    return { success: true, data: result };
  } catch (err) {
    console.error("Error computing today durations:", err);
    return { success: false, error: "Error computing today durations" };
  }
}
