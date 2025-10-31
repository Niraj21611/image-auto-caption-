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

function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hrs} hr` + (hrs > 1 ? "s" : "");
  return `${hrs} hr${hrs > 1 ? "s" : ""} ${mins} mins`;
}

export async function getUsersTodayDurations(userIds: string[]) {
  try {
    if (!userIds || userIds.length === 0) 
      return { success: true, data: {} as Record<string, { minutes: number; formatted: string; isOnline: boolean }> };

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(startOfDay.getDate() + 1);

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
    const onlineUsers = new Set<string>();
    
    for (const act of activities) {
      const start = act.loginAt < startOfDay ? startOfDay : act.loginAt;
      const rawEnd = act.logoutAt ?? now;
      const end = rawEnd > endOfDay ? endOfDay : rawEnd;
      const diff = Math.max(0, end.getTime() - start.getTime());
      const mins = Math.floor(diff / 60000);
      totals.set(act.userId, (totals.get(act.userId) || 0) + mins);
      
      if (!act.logoutAt) {
        onlineUsers.add(act.userId);
      }
    }

    const result: Record<string, { minutes: number; formatted: string; isOnline: boolean }> = {};
    for (const id of userIds) {
      const mins = totals.get(id) || 0;
      result[id] = { 
        minutes: mins, 
        formatted: formatDuration(mins),
        isOnline: onlineUsers.has(id)
      };
    }

    return { success: true, data: result };
  } catch (err) {
    console.error("Error computing today durations:", err);
    return { success: false, error: "Error computing today durations" };
  }
}

export async function getUserWeeklyActivity(userId: string, startDate: Date, endDate: Date) {
  try {
    const activities = await prisma.userActivity.findMany({
      where: {
        userId,
        loginAt: { gte: startDate, lt: endDate },
      },
      select: {
        loginAt: true,
        logoutAt: true,
        date: true,
      },
      orderBy: { loginAt: "asc" },
    });

    const dailyTotals = new Map<string, number>();
    const now = new Date();
    const fmtLocalKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    };
    
    for (const act of activities) {
      // Compute boundaries using the local day of loginAt to avoid UTC shifting
      const loginLocal = new Date(act.loginAt);
      const dayStart = new Date(
        loginLocal.getFullYear(),
        loginLocal.getMonth(),
        loginLocal.getDate()
      );
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dateKey = fmtLocalKey(dayStart);
      
      const start = act.loginAt < dayStart ? dayStart : act.loginAt;
      const rawEnd = act.logoutAt ?? now;
      const end = rawEnd > dayEnd ? dayEnd : rawEnd;
      const diff = Math.max(0, end.getTime() - start.getTime());
      const mins = Math.floor(diff / 60000);
      
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + mins);
    }

    const result: Array<{ date: string; minutes: number; formatted: string }> = [];
    const current = new Date(startDate);
    
    while (current < endDate) {
      // Build keys in local time to match grouping
      const dateKey = fmtLocalKey(current);
      const mins = dailyTotals.get(dateKey) || 0;
      result.push({
        date: dateKey,
        minutes: mins,
        formatted: formatDuration(mins),
      });
      current.setDate(current.getDate() + 1);
    }

    const totalMinutes = Array.from(dailyTotals.values()).reduce((sum, m) => sum + m, 0);

    return {
      success: true,
      data: {
        daily: result,
        totalMinutes,
        totalFormatted: formatDuration(totalMinutes),
      },
    };
  } catch (err) {
    console.error("Error fetching weekly activity:", err);
    return { success: false, error: "Error fetching weekly activity" };
  }
}
