"use client";

import React, { useEffect, useState } from "react";
import { MoreVertical, Plus, Eye, Pencil, Trash2, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogOverlay } from "@radix-ui/react-dialog";
import {
  changePassword,
  createUser,
  deleteUserById,
  getAllUsers,
  updateUser,
} from "@/lib/actions/user.actions";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface User {
  id: string;
  name: string;
  email: string;
  password: string;
}

export default function Page() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] =
    useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await getAllUsers();
        if (res.success && res.data) {
          setUsers(res.data);
          toast.success("Users loaded successfully!");
        } else {
          toast.error(res.error || "Failed to load users");
        }
      } catch (err) {
        console.error("Error loading users:", err);
        toast.error("Unexpected error while fetching users");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const handleAddUser = async () => {
    try {
      if (!formData.name || !formData.email || !formData.password) {
        toast.error("All fields are required");
        return;
      }

      const res = await createUser(
        formData.email,
        formData.password,
        formData.name
      );

      if (res.success && res.user) {
        toast.success("User created successfully!");
        setUsers((prev) => [...prev, res.user]);
        setFormData({ name: "", email: "", password: "" });
        setIsAddDialogOpen(false);
      } else {
        toast.error(res.error || "Failed to create user");
      }
    } catch (err) {
      console.error(err);
      toast.error("Unexpected error while creating user");
    }
  };

  const handleEditUser = async () => {
    try {
      if (!selectedUser || !formData.name || !formData.email) {
        toast.error("Name and email are required");
        return;
      }

      const res = await updateUser(selectedUser.id, {
        name: formData.name,
        email: formData.email,
      });

      if (res.success && res.user) {
        toast.success("User updated successfully!");
        setUsers((prev) =>
          prev.map((u) => (u.id === selectedUser.id ? res.user : u))
        );
        setIsEditDialogOpen(false);
        setSelectedUser(null);
        setFormData({ name: "", email: "", password: "" });
      } else {
        toast.error(res.error || "Failed to update user");
      }
    } catch (err) {
      console.error(err);
      toast.error("Unexpected error while updating user");
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      const res = await deleteUserById(id);

      if (res.success) {
        toast.success("User deleted successfully!");
        setUsers((prev) => prev.filter((u) => u.id !== id));
      } else {
        toast.error(res.error || "Failed to delete user");
      }
    } catch (err) {
      console.error(err);
      toast.error("Unexpected error while deleting user");
    }
  };

  const handleChangePassword = async () => {
    try {
      if (!selectedUser || !newPassword) {
        toast.error("Please enter a new password");
        return;
      }

      const res = await changePassword(newPassword, selectedUser.id);

      if (res.success) {
        toast.success("Password changed successfully!");

        setUsers((prev) =>
          prev.map((user) =>
            user.id === selectedUser.id
              ? { ...user, password: newPassword }
              : user
          )
        );

        // Reset form/dialog
        setIsChangePasswordDialogOpen(false);
        setSelectedUser(null);
        setNewPassword("");
      } else {
        toast.error(res.error || "Failed to change password");
      }
    } catch (err) {
      console.error(err);
      toast.error("Unexpected error while changing password");
    }
  };

  const openViewDialog = (user: User) => {
    setSelectedUser(user);
    setIsViewDialogOpen(true);
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({ name: user.name, email: user.email, password: "" });
    setIsEditDialogOpen(true);
  };

  const openChangePasswordDialog = (user: User) => {
    setSelectedUser(user);
    setIsChangePasswordDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center space-x-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return <p className="text-gray-500">No users found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  User Management
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage user and their profile
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="default"
                size="lg"
                onClick={() => setIsAddDialogOpen(true)}
              >
                <Plus />
                Create User
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="p-6">
        <div className="bg-white rounded-lg border border-neutral-200 shadow-sm p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold text-neutral-700">
                  Name
                </TableHead>
                <TableHead className="font-semibold text-neutral-700">
                  Email
                </TableHead>
                <TableHead className="text-right font-semibold text-neutral-700">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className="hover:bg-neutral-50">
                  <TableCell className="font-medium text-neutral-800">
                    {user.name}
                  </TableCell>
                  <TableCell className="text-neutral-600">
                    {user.email}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="hover:bg-neutral-100"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => openViewDialog(user)}
                          className="cursor-pointer"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openEditDialog(user)}
                          className="cursor-pointer"
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => openChangePasswordDialog(user)}
                          className="cursor-pointer"
                        >
                          <Key className="w-4 h-4 mr-2" />
                          Change Password
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteUser(user.id)}
                          className="cursor-pointer text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogOverlay className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account with their details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                placeholder="Enter name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                placeholder="Enter email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-password">Password</Label>
              <Input
                id="add-password"
                type="password"
                placeholder="Enter password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddUser}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View User Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>View user information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={selectedUser?.name || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={selectedUser?.email || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                value={selectedUser?.password || ""}
                type="password"
                disabled
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                placeholder="Enter name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="Enter email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditUser}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog
        open={isChangePasswordDialogOpen}
        onOpenChange={setIsChangePasswordDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter a new password for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsChangePasswordDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
