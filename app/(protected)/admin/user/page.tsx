"use client";

import  { useEffect, useState } from "react";
import {
  MoreVertical,
  Plus,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Key,
  Search,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
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
  getUsersTodayDurations,
  getUserWeeklyActivity,
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

interface UserOnlineStatus {
  minutes: number;
  formatted: string;
  isOnline: boolean;
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
  const [showPassword, setShowPassword] = useState(false);
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [todayDurations, setTodayDurations] = useState<Record<string, UserOnlineStatus>>({});
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [sortBy, setSortBy] = useState<"most-active" | "active-first" | "none">("none");
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [weeklyData, setWeeklyData] = useState<{
    daily: Array<{ date: string; minutes: number; formatted: string }>;
    totalMinutes: number;
    totalFormatted: string;
  } | null>(null);
  const [weekOffset, setWeekOffset] = useState(0); 

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [newPassword, setNewPassword] = useState("");

  const sanitizePasswordInput = (value: string) => value.replace(/\s/g, "");

  const filteredUsers = users
    .filter(
      (user) =>
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "most-active") {
        const aMinutes = todayDurations[a.id]?.minutes || 0;
        const bMinutes = todayDurations[b.id]?.minutes || 0;
        return bMinutes - aMinutes;
      } else if (sortBy === "active-first") {
        const aOnline = todayDurations[a.id]?.isOnline || false;
        const bOnline = todayDurations[b.id]?.isOnline || false;
        if (aOnline === bOnline) return 0;
        return aOnline ? -1 : 1;
      }
      return 0;
    });

  const fetchUsersData = async () => {
    try {
      setIsRefreshing(true);
      const res = await getAllUsers();
      if (res.success && res.data) {
        setUsers(res.data);
        const ids = res.data.map((u: User) => u.id);
        const d = await getUsersTodayDurations(ids);
        if (d.success && d.data) {
          setTodayDurations(d.data as any);
        }
      } else {
        toast.error(res.error || "Failed to load users");
      }
    } catch (err) {
      console.error("Error loading users:", err);
      toast.error("Unexpected error while fetching users");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsersData();
  }, []);

  useEffect(() => {
    if (isViewDialogOpen && selectedUser) {
      fetchWeeklyData();
    }
  }, [isViewDialogOpen, selectedUser, weekOffset]);

  const fetchWeeklyData = async () => {
    if (!selectedUser) return;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset + (weekOffset * 7));
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const res = await getUserWeeklyActivity(selectedUser.id, weekStart, weekEnd);
    if (res.success && res.data) {
      setWeeklyData(res.data);
    }
  };

  const getWeekRangeText = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + mondayOffset + (weekOffset * 7));
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const formatDate = (d: Date) => {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
  };

  const copyPassword = () => {
    if (selectedUser?.password) {
      navigator.clipboard.writeText(selectedUser.password);
      setPasswordCopied(true);
      toast.success("Password copied to clipboard");
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

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
        setShowAddPassword(false);
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

        setIsChangePasswordDialogOpen(false);
        setSelectedUser(null);
        setNewPassword("");
        setShowNewPassword(false);
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
    setShowPassword(false);
    setPasswordCopied(false);
    setWeekOffset(0);
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
      <div className="space-y-6">
        <div className="sticky top-0 z-50 bg-white border-b border-border">
          <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16">
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  User Management
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage user and their profile
                </p>
              </div>
            </div>
          </div>
        </div>
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-50 bg-white border-b border-border">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                User Management
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage user and their profile
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search users by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-white border-gray-300 focus:border-blue-500 focus:ring-blue-500 rounded-lg shadow-sm"
            />
          </div>
          
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-11 px-4 border-gray-300 hover:bg-gray-50 gap-2"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  {sortBy === "most-active" ? "Most Active" : sortBy === "active-first" ? "Active First" : "Sort By"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setSortBy("none")}
                  className="cursor-pointer"
                >
                  <span className={sortBy === "none" ? "font-semibold" : ""}>
                    Default Order
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("most-active")}
                  className="cursor-pointer"
                >
                  <span className={sortBy === "most-active" ? "font-semibold" : ""}>
                    Most Logged In Time
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy("active-first")}
                  className="cursor-pointer"
                >
                  <span className={sortBy === "active-first" ? "font-semibold" : ""}>
                    Active Users First
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="lg"
              onClick={fetchUsersData}
              disabled={isRefreshing}
              className="h-11 px-4 border-gray-300 hover:bg-gray-50 gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Button
              variant="default"
              size="lg"
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 font-medium h-11 px-6 shadow-sm"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create User
            </Button>
          </div>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="p-6">
          <div className="bg-linear-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300 p-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="rounded-full bg-white p-6 shadow-md">
                <svg
                  className="w-16 h-16 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-gray-900">
                  No Users Available
                </h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  Get started by creating your first user account. You can
                  manage users, update their information, and control access
                  from here.
                </p>
              </div>
              <Button
                variant="default"
                size="lg"
                onClick={() => setIsAddDialogOpen(true)}
                className="mt-4 bg-blue-600 hover:bg-blue-700 font-medium"
              >
                <Plus className="w-5 h-5 mr-2" />
                Create Your First User
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-6 pb-6">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-sm overflow-hidden p-4">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-neutral-200 hover:bg-neutral-100">
                  <TableHead className="font-semibold text-neutral-800 h-12">
                    Name
                  </TableHead>
                  <TableHead className="font-semibold text-neutral-800 h-12">
                    Email
                  </TableHead>
                  <TableHead className="font-semibold text-neutral-800 h-12">
                    Total Logged In Time (Today)
                  </TableHead>
                  <TableHead className="text-right font-semibold text-neutral-800 h-12">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Search className="h-10 w-10 text-gray-300" />
                        <p className="text-gray-500 font-medium">No users found</p>
                        <p className="text-sm text-gray-400">
                          Try adjusting your search query
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow
                      key={user.id}
                      className="hover:bg-neutral-50 border-b border-neutral-100 last:border-0 cursor-pointer"
                      onClick={() => openViewDialog(user)}
                    >
                      <TableCell className="font-medium text-neutral-900 py-4">
                        <div className="flex items-center gap-2">
                          {user.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-neutral-600 py-4">
                        {user.email}
                      </TableCell>
                      <TableCell className="text-neutral-700 py-4">
                        <div className="flex items-center gap-2">
                          {todayDurations[user.id]?.formatted ? (
                            <>
                              <div className={`w-2 h-2 rounded-full ${todayDurations[user.id]?.isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                todayDurations[user.id]?.isOnline 
                                  ? 'bg-green-100 text-green-800 border border-green-200' 
                                  : 'bg-gray-100 text-gray-700 border border-gray-200'
                              }`}>
                                {todayDurations[user.id]?.formatted}
                              </span>
                              {todayDurations[user.id]?.isOnline && (
                                <span className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">
                                  Active
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right py-4" onClick={(e) => e.stopPropagation()}>
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) {
            setShowAddPassword(false);
            setFormData({ name: "", email: "", password: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Add New User
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Create a new user account with their details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor="add-name"
                className="text-sm font-semibold text-gray-900"
              >
                Name
              </Label>
              <Input
                id="add-name"
                placeholder="Enter name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="add-email"
                className="text-sm font-semibold text-gray-900"
              >
                Email
              </Label>
              <Input
                id="add-email"
                type="email"
                placeholder="Enter email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="add-password"
                className="text-sm font-semibold text-gray-900"
              >
                Password
              </Label>
              <div className="relative">
                <Input
                  id="add-password"
                  type={showAddPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      password: sanitizePasswordInput(e.target.value),
                    })
                  }
                  className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowAddPassword(!showAddPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showAddPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                setShowAddPassword(false);
                setFormData({ name: "", email: "", password: "" });
              }}
              className="font-medium"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddUser}
              className="bg-blue-600 hover:bg-blue-700 font-medium"
            >
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <div className="border-b border-gray-200 pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${todayDurations[selectedUser?.id || '']?.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedUser?.name}</h2>
                  <p className="text-sm text-gray-600 mt-1">{selectedUser?.email}</p>
                </div>
              </div>
              <div className="flex gap-2 mr-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPassword(!showPassword)}
                  className="gap-2"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showPassword ? "Hide" : "View"} Password
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyPassword}
                  className="gap-2"
                >
                  {passwordCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {passwordCopied ? "Copied!" : "Copy Password"}
                </Button>
              </div>
            </div>
            {showPassword && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-mono text-gray-900">{selectedUser?.password}</p>
              </div>
            )}
          </div>

          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Login Activity</h3>
                <p className="text-sm text-gray-600">Weekly time tracking</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekOffset(weekOffset - 1)}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-md text-sm font-medium min-w-60 text-center">
                  {getWeekRangeText()}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekOffset(weekOffset + 1)}
                  disabled={weekOffset >= 0}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="bg-linear-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-900">Total Login Time (This Week)</p>
                  <p className="text-3xl font-bold text-blue-700 mt-1">
                    {weeklyData?.totalFormatted || "0 mins"}
                  </p>
                </div>
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {weeklyData?.daily.map((day, idx) => {
                const date = new Date(day.date);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = date.getDate();
                const isToday = new Date().toDateString() === date.toDateString();
                
                return (
                  <div
                    key={day.date}
                    className={`p-4 rounded-lg border-2 ${
                      isToday
                        ? 'bg-blue-50 border-blue-500'
                        : day.minutes > 0
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="text-center">
                      <p className={`text-xs font-semibold uppercase ${
                        isToday ? 'text-blue-700' : 'text-gray-600'
                      }`}>
                        {dayName}
                      </p>
                      <p className={`text-lg font-bold mt-1 ${
                        isToday ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {dayNum}
                      </p>
                      <div className={`mt-2 pt-2 border-t ${
                        isToday ? 'border-blue-200' : 'border-gray-200'
                      }`}>
                        <p className={`text-xs font-medium ${
                          day.minutes > 0
                            ? isToday
                              ? 'text-blue-700'
                              : 'text-green-700'
                            : 'text-gray-500'
                        }`}>
                          {day.formatted}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="border-t border-gray-200 pt-4 mt-4">
            <Button
              onClick={() => setIsViewDialogOpen(false)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Edit User
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Update user information
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor="edit-name"
                className="text-sm font-semibold text-gray-900"
              >
                Name
              </Label>
              <Input
                id="edit-name"
                placeholder="Enter name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="edit-email"
                className="text-sm font-semibold text-gray-900"
              >
                Email
              </Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="Enter email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              className="font-medium"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditUser}
              className="bg-blue-600 hover:bg-blue-700 font-medium"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isChangePasswordDialogOpen}
        onOpenChange={(open) => {
          setIsChangePasswordDialogOpen(open);
          if (!open) {
            setShowNewPassword(false);
            setNewPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Change Password
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Enter a new password for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor="new-password"
                className="text-sm font-semibold text-gray-900"
              >
                New Password
              </Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) =>
                    setNewPassword(sanitizePasswordInput(e.target.value))
                  }
                  className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsChangePasswordDialogOpen(false);
                setShowNewPassword(false);
                setNewPassword("");
              }}
              className="font-medium"
            >
              Cancel
            </Button>
            <Button
              onClick={handleChangePassword}
              className="bg-blue-600 hover:bg-blue-700 font-medium"
            >
              Change Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
