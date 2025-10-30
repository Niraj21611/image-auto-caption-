import { UserRole } from "@prisma/client";
import NextAuth, { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      name: string;
      email: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string;
    role: UserRole;
  }
}
