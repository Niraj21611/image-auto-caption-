import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChangePasswordForm from "../../user/_components/ChangePasswordForm";

export default async function AdminSettingPage() {
  const session = await getServerSession(nextauthOptions);

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/signin");
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Settings
              </h1>
              <p className="text-sm text-muted-foreground">
                Manage your account settings
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
            <div className="border-b border-slate-200 bg-linear-to-r from-blue-50 to-indigo-50 px-6 py-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
                Change Password
              </h2>
              <p className="text-sm text-slate-600 mt-1">
                Update your password to keep your account secure
              </p>
            </div>
            <div className="px-6 py-8">
              <ChangePasswordForm userId={session.user.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
