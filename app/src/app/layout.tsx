import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Entradas — Reselling Dashboard",
  description: "Ticket reselling admin & financial dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-950 text-gray-100 min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
