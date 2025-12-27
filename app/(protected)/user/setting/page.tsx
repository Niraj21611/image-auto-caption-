import { getServerSession } from "next-auth";
import { nextauthOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ChangePasswordForm from "../_components/ChangePasswordForm";

export default async function UserSettingPage() {
  const session = await getServerSession(nextauthOptions);

  if (!session?.user) {
    redirect("/signin");
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-indigo-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white border-b border-border mb-6">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
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

      <div className="max-w-4xl mx-auto px-6 pb-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-6">
            Change Password
          </h2>
          <ChangePasswordForm userId={session.user.id} />
        </div>
      </div>
    </div>
  );
}
