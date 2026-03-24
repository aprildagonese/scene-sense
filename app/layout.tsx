import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import ResetButton from "@/components/ResetButton";

export const metadata: Metadata = {
  title: "Scene Sense",
  description: "AI-powered social media video generator — built on DigitalOcean",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <ResetButton />
            <div className="flex gap-1">
              <Link
                href="/"
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Create
              </Link>
              <Link
                href="/history"
                className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                History
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
