"use client";

import { useState } from "react";
import { Mail, Lock, AlertCircle, EyeOff, Eye } from "lucide-react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const validateEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password: string) => {
  return password.length >= 6;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    setErrors({});

    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(email)) {
      newErrors.email = "Invalid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    } else if (!validatePassword(password)) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (res?.ok) {
        toast.success("Signed in successfully");
        const sessionRes = await fetch("/api/auth/session");
        const session = await sessionRes.json();

        if (session?.user?.role === "ADMIN") {
          router.push("/admin");
        } else {
          router.push("/user");
        }
      } else {
        toast.error("Invalid credentials");
      }
    } catch (error) {
      setErrors({ password: "Something went wrong. Try again later." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Sign in</h1>
            <p className="text-gray-600">Sign in with email address</p>
          </div>

          {/* Form Fields */}
          <div className="space-y-6">
            {/* Email Field */}
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className={`w-full pl-12 pr-4 py-3 border rounded-lg focus:outline-none text-black focus:ring-2 focus:ring-blue-500 transition-all ${
                    errors.email ? "border-red-500" : "border-gray-300"
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                />
              </div>
              {errors.email && (
                <div className="mt-2 flex items-center text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.email}
                </div>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className={`w-full pl-12 pr-12 py-3 border text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                    errors.password ? "border-red-500" : "border-gray-300"
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <div className="mt-2 flex items-center text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.password}
                </div>
              )}
            </div>

            {/* Sign In Button */}
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
