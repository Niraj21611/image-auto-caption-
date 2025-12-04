"use server";

import prisma from "../prisma";

export async function getUser(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
      },
    });
    if (!user) {
      return { success: false, error: "User not found" };
    }
    return { success: true, data: user };
  } catch (err) {
    console.log("Error creating user", err);
    return { success: false, error: "Error creating user" };
  }
}

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

// Auto-checkout helper: Check if user has been checked in for more than 9 hours and auto-checkout
async function autoCheckoutIfStale(userId: string) {
  try {
    const now = new Date();
    const nineHoursAgo = new Date(now.getTime() - 9 * 60 * 60 * 1000); // 9 hours in milliseconds

    // Find all unclosed activities older than 9 hours
    const staleActivities = await prisma.userActivity.findMany({
      where: {
        userId,
        checkOutAt: null,
        checkInAt: {
          lt: nineHoursAgo,
        },
      },
    });

    // Auto-checkout each stale activity
    for (const activity of staleActivities) {
      const diff = now.getTime() - activity.checkInAt.getTime();
      const minutes = Math.min(Math.floor(diff / 60000), 9 * 60); // Cap at 9 hours

      await prisma.userActivity.update({
        where: { id: activity.id },
        data: {
          checkOutAt: now,
          duration: minutes,
        },
      });

      console.log(`[Auto-checkout] Checked out stale activity ${activity.id} for user ${userId}`);
    }

    // If any stale activities were found, update user's isCheckedIn status
    if (staleActivities.length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { isCheckedIn: false },
      });
      console.log(`[Auto-checkout] Updated user ${userId} isCheckedIn to false`);
    }

    return staleActivities.length;
  } catch (err) {
    console.error("[Auto-checkout] Error in autoCheckoutIfStale:", err);
    return 0;
  }
}

// Check-in: Start tracking user activity
export async function checkIn(userId: string) {
  try {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    console.log("[Server checkIn] Starting check-in for user:", userId);

    // First, check for any stale check-ins (over 9 hours) and auto-checkout
    await autoCheckoutIfStale(userId);

    // Check if user is already checked in
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isCheckedIn: true },
    });

    console.log("[Server checkIn] Current isCheckedIn:", user?.isCheckedIn);

    if (user?.isCheckedIn) {
      return { success: false, error: "Already checked in" };
    }

    // Check for any unclosed activity (safety check)
    const unclosedActivity = await prisma.userActivity.findFirst({
      where: {
        userId,
        checkOutAt: null,
      },
      orderBy: { checkInAt: "desc" },
    });

    console.log("[Server checkIn] Unclosed activity:", unclosedActivity ? `ID: ${unclosedActivity.id}` : "NONE");

    // If there's an unclosed activity, close it first
    if (unclosedActivity) {
      const diff = now.getTime() - unclosedActivity.checkInAt.getTime();
      const minutes = Math.min(Math.floor(diff / 60000), 9 * 60); // Cap at 9 hours
      
      console.log("[Server checkIn] Closing unclosed activity with duration:", minutes);
      
      await prisma.userActivity.update({
        where: { id: unclosedActivity.id },
        data: {
          checkOutAt: now,
          duration: minutes,
        },
      });
    }

    // Update user's isCheckedIn flag
    await prisma.user.update({
      where: { id: userId },
      data: { isCheckedIn: true },
    });

    console.log("[Server checkIn] Updated user isCheckedIn to true");

    // Create new activity record
    const newActivity = await prisma.userActivity.create({
      data: {
        userId,
        checkInAt: now,
        date: startOfDay,
      },
    });

    console.log("[Server checkIn] Created new activity:", newActivity.id);

    return { success: true };
  } catch (err) {
    console.error("Error checking in:", err);
    return { success: false, error: "Error checking in" };
  }
}

// Check-out: Stop tracking and calculate duration
export async function checkOut(userId: string) {
  try {
    const now = new Date();
    console.log("[Server checkOut] Starting checkout for user:", userId);

    // Check if user is actually checked in
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isCheckedIn: true },
    });

    console.log("[Server checkOut] User isCheckedIn:", user?.isCheckedIn);

    if (!user?.isCheckedIn) {
      return { success: false, error: "You are not currently checked in" };
    }

    // Debug: Check all activities for this user
    const allActivities = await prisma.userActivity.findMany({
      where: { userId },
      orderBy: { checkInAt: "desc" },
      take: 5,
    });
    
    console.log("[Server checkOut] All recent activities:", allActivities.map(a => ({
      id: a.id,
      checkInAt: a.checkInAt,
      checkOutAt: a.checkOutAt,
    })));

    // Find the most recent unclosed activity - try without the null check first
    const activity = allActivities.find(a => !a.checkOutAt);
    
    console.log("[Server checkOut] Found activity via find:", activity ? `ID: ${activity.id}` : "NONE");

    if (!activity) {
      // Inconsistent state - fix it
      console.log("[Server checkOut] No activity found, resetting user status");
      await prisma.user.update({
        where: { id: userId },
        data: { isCheckedIn: false },
      });
      return { success: false, error: "No active check-in session found. Your status has been reset." };
    }

    // Calculate duration in minutes (max 12 hours per session)
    const diff = now.getTime() - activity.checkInAt.getTime();
    const minutes = Math.min(Math.floor(diff / 60000), 12 * 60);

    console.log("[Server checkOut] Duration:", minutes, "minutes");

    // Update activity with check-out time and duration
    await prisma.userActivity.update({
      where: { id: activity.id },
      data: {
        checkOutAt: now,
        duration: minutes,
      },
    });

    // Update user's isCheckedIn flag
    await prisma.user.update({
      where: { id: userId },
      data: { isCheckedIn: false },
    });

    return { success: true, data: { duration: minutes } };
  } catch (err) {
    console.error("Error checking out:", err);
    return { success: false, error: "Error checking out" };
  }
}

// Get current check-in status
export async function getActiveCheckIn(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isCheckedIn: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    if (!user.isCheckedIn) {
      return { success: true, data: { isCheckedIn: false } };
    }

    // Find the active session
    const activity = await prisma.userActivity.findFirst({
      where: {
        userId,
        checkOutAt: null,
      },
      orderBy: { checkInAt: "desc" },
    });

    if (!activity) {
      // Inconsistent state - fix it
      await prisma.user.update({
        where: { id: userId },
        data: { isCheckedIn: false },
      });
      return { success: true, data: { isCheckedIn: false } };
    }

    // Auto checkout after 12 hours
    const now = new Date();
    const diff = now.getTime() - activity.checkInAt.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (hours >= 12) {
      await checkOut(userId);
      return { success: true, data: { isCheckedIn: false } };
    }

    return {
      success: true,
      data: {
        isCheckedIn: true,
        checkInAt: activity.checkInAt,
        elapsedMinutes: Math.floor(diff / 60000),
      },
    };
  } catch (err) {
    console.error("Error getting active check-in:", err);
    return { success: false, error: "Error getting active check-in" };
  }
}

export async function getUsersTodayDurations(userIds: string[]) {
  try {
    if (!userIds || userIds.length === 0)
      return {
        success: true,
        data: {} as Record<
          string,
          { minutes: number; milliseconds: number; formatted: string; isOnline: boolean }
        >,
      };

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(startOfDay.getDate() + 1);

    // Auto-checkout any stale check-ins (over 9 hours) for all users
    for (const userId of userIds) {
      await autoCheckoutIfStale(userId);
    }

    // Get all users to check isCheckedIn status
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, isCheckedIn: true },
    });

    // Get all activities for today - fetch all and filter in JS instead of using checkOutAt: null
    const activities = await prisma.userActivity.findMany({
      where: {
        userId: { in: userIds },
        checkInAt: { gte: startOfDay, lt: endOfDay },
      },
      select: {
        userId: true,
        checkInAt: true,
        checkOutAt: true,
      },
      orderBy: { checkInAt: "asc" },
    });

    console.log(`[getUsersTodayDurations] Found ${activities.length} activities for ${userIds.length} users`);

    const totals = new Map<string, number>();
    const totalsMs = new Map<string, number>();  // Track milliseconds for precision
    const onlineUsersMap = new Map<string, boolean>();

    // Set online status from user's isCheckedIn flag
    for (const user of users) {
      onlineUsersMap.set(user.id, user.isCheckedIn);
    }

    for (const act of activities) {
      const start = act.checkInAt < startOfDay ? startOfDay : act.checkInAt;
      const rawEnd = act.checkOutAt ?? now;
      const end = rawEnd > endOfDay ? endOfDay : rawEnd;
      const diff = Math.max(0, end.getTime() - start.getTime());
      const mins = Math.floor(diff / 60000);
      
      console.log(`[getUsersTodayDurations] Activity for ${act.userId}: ${mins} mins (checkOut: ${act.checkOutAt ? 'yes' : 'NO (active)'})`);
      
      totals.set(act.userId, (totals.get(act.userId) || 0) + mins);
      totalsMs.set(act.userId, (totalsMs.get(act.userId) || 0) + diff);  // Store precise ms
    }

    const result: Record<
      string,
      { minutes: number; milliseconds: number; formatted: string; isOnline: boolean }
    > = {};
    for (const id of userIds) {
      const mins = totals.get(id) || 0;
      const ms = totalsMs.get(id) || 0;
      result[id] = {
        minutes: mins,
        milliseconds: ms,  // Add milliseconds for precision
        formatted: formatDuration(mins),
        isOnline: onlineUsersMap.get(id) || false,
      };
    }

    return { success: true, data: result };
  } catch (err) {
    console.error("Error computing today durations:", err);
    return { success: false, error: "Error computing today durations" };
  }
}

export async function getUserWeeklyActivity(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  try {
    const activities = await prisma.userActivity.findMany({
      where: {
        userId,
        checkInAt: { gte: startDate, lt: endDate },
      },
      select: {
        checkInAt: true,
        checkOutAt: true,
        date: true,
      },
      orderBy: { checkInAt: "asc" },
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
      // Compute boundaries using the local day of checkInAt to avoid UTC shifting
      const checkInLocal = new Date(act.checkInAt);
      const dayStart = new Date(
        checkInLocal.getFullYear(),
        checkInLocal.getMonth(),
        checkInLocal.getDate()
      );
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dateKey = fmtLocalKey(dayStart);

      const start = act.checkInAt < dayStart ? dayStart : act.checkInAt;
      const rawEnd = act.checkOutAt ?? now;
      const end = rawEnd > dayEnd ? dayEnd : rawEnd;
      const diff = Math.max(0, end.getTime() - start.getTime());
      const mins = Math.floor(diff / 60000);

      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + mins);
    }

    const result: Array<{ date: string; minutes: number; formatted: string }> =
      [];
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

    const totalMinutes = Array.from(dailyTotals.values()).reduce(
      (sum, m) => sum + m,
      0
    );

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

// Get user's sessions for a specific day
export async function getUserDailySessions(
  userId: string,
  dayStart: Date,
  dayEnd?: Date
) {
  try {
    const endOfDay = dayEnd || new Date(dayStart);
    if (!dayEnd) {
      endOfDay.setDate(dayStart.getDate() + 1);
    }

    const activities = await prisma.userActivity.findMany({
      where: {
        userId,
        checkInAt: { gte: dayStart, lt: endOfDay },
      },
      select: {
        checkInAt: true,
        checkOutAt: true,
        duration: true,
      },
      orderBy: { checkInAt: "asc" },
    });

    return {
      success: true,
      data: activities.map((act) => ({
        checkInAt: act.checkInAt,
        checkOutAt: act.checkOutAt,
        duration: act.duration,
        isActive: !act.checkOutAt,
      })),
    };
  } catch (err) {
    console.error("Error fetching daily sessions:", err);
    return { success: false, error: "Error fetching daily sessions" };
  }
}
