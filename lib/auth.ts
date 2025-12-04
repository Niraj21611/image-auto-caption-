import { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import prisma from "./prisma";
import { UserRole } from "@prisma/client";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { JWT } from "next-auth/jwt";

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
      // Login activity is now tracked via manual check-in/check-out
      // No automatic activity recording on sign-in
      console.log(`User ${user.email} signed in`);
    },
    async signOut({ token }) {
      // Logout activity is now tracked via manual check-in/check-out
      // Auto check-out user if they are checked in
      try {
        const userId = (token as JWT)?.sub || (token as { id?: string })?.id;
        if (!userId) return;

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { isCheckedIn: true },
        });

        if (user?.isCheckedIn) {
          // Auto checkout on logout
          const activity = await prisma.userActivity.findFirst({
            where: {
              userId,
              checkOutAt: null,
            },
            orderBy: { checkInAt: "desc" },
          });

          if (activity) {
            const now = new Date();
            const diff = now.getTime() - activity.checkInAt.getTime();
            const minutes = Math.min(Math.floor(diff / 60000), 12 * 60);

            await prisma.userActivity.update({
              where: { id: activity.id },
              data: {
                checkOutAt: now,
                duration: minutes,
              },
            });

            await prisma.user.update({
              where: { id: userId },
              data: { isCheckedIn: false },
            });
          }
        }
      } catch (err) {
        console.error("Failed to auto checkout on signout", err);
      }
    },
  },
};
