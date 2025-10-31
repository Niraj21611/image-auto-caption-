"use server";

import prisma from "../prisma";

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
