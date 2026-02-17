import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "BetterNotes — Turn messy notes into clean LaTeX + PDF",
    template: "%s | BetterNotes",
  },
  description:
    "Upload lecture slides or notes and generate formula sheets, summaries, or cheatsheets as beautiful LaTeX documents in seconds.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://betternotes.ai"
  ),
  openGraph: {
    title: "BetterNotes — Turn messy notes into clean LaTeX + PDF",
    description:
      "Upload lecture slides or notes and generate formula sheets, summaries, or cheatsheets as beautiful LaTeX documents in seconds.",
    siteName: "BetterNotes",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "BetterNotes — Turn messy notes into clean LaTeX + PDF",
    description:
      "Upload lecture slides or notes and generate formula sheets, summaries, or cheatsheets as beautiful LaTeX documents in seconds.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
