import type { Metadata } from "next";
import {DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"], // you can adjust as needed
});

export const metadata: Metadata = {
  title: "Sakal Auto Caption",
  description: "AI-powered auto captioning app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={` ${dmSans.variable} antialiased font-sans`}
      >
        {children}
        <Toaster position="bottom-right" closeButton richColors />
      </body>
    </html>
  );
}
