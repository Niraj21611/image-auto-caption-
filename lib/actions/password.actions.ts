"use server";

import prisma from "../prisma";
import bcrypt from "bcryptjs";

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  try {
    if (!userId || !currentPassword || !newPassword) {
      return { success: false, error: "Missing required fields" };
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isPasswordValid) {
      return { success: false, error: "Current password is incorrect" };
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return {
      success: true,
      data: { message: "Password changed successfully" },
    };
  } catch (error) {
    console.error("Error changing password:", error);
    return { success: false, error: "Failed to change password" };
  }
}
