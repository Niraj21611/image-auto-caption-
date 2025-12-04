"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  checkIn,
  checkOut,
  getUsersTodayDurations,
} from "@/lib/actions/user.actions";

interface HeaderCheckInOutProps {
  userId: string;
}

export default function HeaderCheckInOut({ userId }: HeaderCheckInOutProps) {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayMs, setDisplayMs] = useState(0);
  const [baseMs, setBaseMs] = useState(0);
  const lastSyncRef = useRef<number>(0);

  // Format milliseconds to HH:MM:SS
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      const todayResult = await getUsersTodayDurations([userId]);
      if (todayResult.success && todayResult.data) {
        const totalMs = todayResult.data[userId]?.milliseconds || 0;
        const online = todayResult.data[userId]?.isOnline || false;
        setBaseMs(totalMs);
        setDisplayMs(totalMs);
        setIsCheckedIn(online);
        lastSyncRef.current = Date.now();
      }
    };
    init();
  }, [userId]);

  // Timer effect - runs every second when checked in
  useEffect(() => {
    if (!isCheckedIn) return;

    const interval = setInterval(() => {
      const drift = Date.now() - lastSyncRef.current;
      setDisplayMs(baseMs + drift);
    }, 1000);

    return () => clearInterval(interval);
  }, [isCheckedIn, baseMs]);

  // Sync with server every 30 seconds when checked in
  useEffect(() => {
    if (!isCheckedIn) return;

    const syncInterval = setInterval(async () => {
      const todayResult = await getUsersTodayDurations([userId]);
      if (todayResult.success && todayResult.data) {
        const totalMs = todayResult.data[userId]?.milliseconds || 0;
        setBaseMs(totalMs);
        lastSyncRef.current = Date.now();
      }
    }, 30000); // 30 seconds

    return () => clearInterval(syncInterval);
  }, [isCheckedIn, userId]);

  const handleCheckIn = async () => {
    setIsLoading(true);
    const result = await checkIn(userId);

    if (result.success) {
      toast.success("Checked in successfully");

      // Refresh totals and set checked-in state
      const todayResult = await getUsersTodayDurations([userId]);

      if (todayResult.success && todayResult.data) {
        const totalMs = todayResult.data[userId]?.milliseconds || 0;
        setBaseMs(totalMs);
        setDisplayMs(totalMs);
        setIsCheckedIn(true);
        lastSyncRef.current = Date.now();
      }
    } else {
      toast.error(result.error || "Failed to check in");
    }

    setIsLoading(false);
  };

  const handleCheckOut = async () => {
    setIsLoading(true);
    const result = await checkOut(userId);

    if (result.success) {
      toast.success("Checked out successfully");

      // Refresh totals and set checked-out state
      const todayResult = await getUsersTodayDurations([userId]);

      if (todayResult.success && todayResult.data) {
        const totalMs = todayResult.data[userId]?.milliseconds || 0;
        setBaseMs(totalMs);
        setDisplayMs(totalMs);
        setIsCheckedIn(false);
        lastSyncRef.current = Date.now();
      }
    } else {
      toast.error(result.error || "Failed to check out");
    }

    setIsLoading(false);
  };

  return (
    <div className="flex items-center gap-3">
      {/* Timer Display */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 rounded-md">
        <Clock className="w-4 h-4 text-neutral-600" />
        <span className="text-sm font-mono font-medium text-neutral-700">
          {formatTime(displayMs)}
        </span>
      </div>

      {/* Check In/Out Button */}
      {isCheckedIn ? (
        <Button
          onClick={handleCheckOut}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="bg-red-50 hover:bg-red-100 border-red-200 text-red-600 hover:text-red-700"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Check Out
        </Button>
      ) : (
        <Button
          onClick={handleCheckIn}
          disabled={isLoading}
          variant="outline"
          size="sm"
          className="bg-green-50 hover:bg-green-100 border-green-200 text-green-600 hover:text-green-700"
        >
          <LogIn className="w-4 h-4 mr-2" />
          Check In
        </Button>
      )}
    </div>
  );
}
