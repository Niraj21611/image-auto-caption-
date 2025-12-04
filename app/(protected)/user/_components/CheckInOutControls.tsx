"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Clock, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  checkIn,
  checkOut,
  getUsersTodayDurations,
} from "@/lib/actions/user.actions";

interface CheckInOutControlsProps {
  userId: string;
}

export default function CheckInOutControls({
  userId,
}: CheckInOutControlsProps) {
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [displayMs, setDisplayMs] = useState(0);
  const [baseMs, setBaseMs] = useState(0);
  const lastSyncRef = useRef(0);

  // Fetch initial status and today's total
  useEffect(() => {
    const init = async () => {
      const todayResult = await getUsersTodayDurations([userId]);
      
      if (todayResult.success && todayResult.data) {
        const totalMs = todayResult.data[userId]?.milliseconds || 0;
        const isOnline = todayResult.data[userId]?.isOnline || false;
        
        setBaseMs(totalMs);
        setDisplayMs(totalMs);
        lastSyncRef.current = Date.now();
        setIsCheckedIn(isOnline);
      }
    };

    init();

    // Listen for check-in/out events from other components
    const handleCheckInEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { isCheckedIn: newState, totalMs } = customEvent.detail;
      setIsCheckedIn(newState);
      setBaseMs(totalMs);
      setDisplayMs(totalMs);
      lastSyncRef.current = Date.now();
    };

    window.addEventListener("checkin-state-changed", handleCheckInEvent);
    return () => {
      window.removeEventListener("checkin-state-changed", handleCheckInEvent);
    };
  }, [userId]);

  // Timer effect - only runs when checked in
  useEffect(() => {
    if (!isCheckedIn) return;

    const interval = setInterval(() => {
      const drift = Date.now() - lastSyncRef.current;
      const newDisplayMs = baseMs + drift;
      setDisplayMs(newDisplayMs);
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

        // Emit event to sync with other components
        window.dispatchEvent(
          new CustomEvent("checkin-state-changed", {
            detail: { isCheckedIn: true, totalMs },
          })
        );
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

        // Emit event to sync with other components
        window.dispatchEvent(
          new CustomEvent("checkin-state-changed", {
            detail: { isCheckedIn: false, totalMs },
          })
        );
      }
    } else {
      toast.error(result.error || "Failed to check out");
    }

    setIsLoading(false);
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-slate-600 mb-1">
            {isCheckedIn ? "Active today" : "Today"}
          </p>
          <p className="text-3xl font-bold text-slate-800">
            {formatTime(displayMs)}
          </p>
        </div>
        <div className="bg-purple-100 p-3 rounded-lg">
          <Clock className="w-8 h-8 text-purple-600" />
        </div>
      </div>

      {isCheckedIn ? (
        <Button
          onClick={handleCheckOut}
          disabled={isLoading}
          variant="destructive"
          className="w-full"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Check Out
        </Button>
      ) : (
        <Button
          onClick={handleCheckIn}
          disabled={isLoading}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          <LogIn className="w-4 h-4 mr-2" />
          Check In
        </Button>
      )}
    </div>
  );
}
