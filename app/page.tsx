import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { nextauthOptions } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(nextauthOptions);

  if (!session?.user) {
    redirect("/signin");
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin");
  }

  redirect("/user");
}
