import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "Entradas — Reselling Dashboard",
  description: "Ticket reselling admin & financial dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="antialiased bg-gray-950 text-gray-100 min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
