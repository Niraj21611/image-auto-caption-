import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import AuthProvider from "@/provider/authProvider";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "CapFlow Auto Caption",
  description: "AI-powered auto captioning app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={` ${dmSans.variable} antialiased font-sans`}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="bottom-right" closeButton richColors />
      </body>
    </html>
  );
}
