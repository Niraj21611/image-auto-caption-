import { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./prisma";
import { UserRole } from "@prisma/client";
import { PrismaAdapter } from "@next-auth/prisma-adapter";

export const nextauthOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/sigin",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email", required: true },
        password: { label: "Password", type: "password", required: true },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error("Missing credentials");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          throw new Error("Invalid email or password");
        }

        const isValid = credentials.password === user.password;

        if (!isValid) {
          throw new Error("Invalid email or password");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as User).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Calculate Monday of the current week (treat Sunday as last day of previous week)
        const day = now.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);
        monday.setHours(0, 0, 0, 0);

        await prisma.userActivity.create({
          data: {
            userId: (user as User).id,
            loginAt: now,
            date: startOfDay,
            weekStart: monday,
          },
        });
      } catch (err) {
        console.error("Failed to record login activity", err);
      }
    },
    async signOut({ token }) {
      try {
        const userId = (token as any)?.sub || (token as any)?.id;
        if (!userId) return;

        console.log("User ID on signOut:", userId);

          // In MongoDB, an optional field may be missing (not set) instead of null.
          // Use OR to match both null and not-set values with isSet: false.
          const latestActivity = await prisma.userActivity.findFirst({
            where: {
              userId,
              OR: [
                { logoutAt: null },
                // For MongoDB, match documents where the field is not set
                // Casting to any to avoid type narrowing issues across Prisma versions
                ({ logoutAt: { isSet: false } } as any),
              ],
            },
            orderBy: [{ loginAt: "desc" }, { createdAt: "desc" }],
          });
        console.log("This is my " ,latestActivity);

        if (latestActivity) {
          const logoutAt = new Date();
          const duration = Math.floor(
            (logoutAt.getTime() - new Date(latestActivity.loginAt).getTime()) / 60000
          );

          await prisma.userActivity.update({
            where: { id: latestActivity.id },
            data: { logoutAt, duration },
          });
        }
      } catch (err) {
        console.error("Failed to record logout activity", err);
      }
    },
  },
};
