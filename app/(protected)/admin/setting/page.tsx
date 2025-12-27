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
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-blue-50 to-slate-100 p-6">
      <div className="max-w-4xl mx-auto">
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
