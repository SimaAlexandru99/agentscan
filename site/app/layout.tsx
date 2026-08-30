import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://agentscan.space"),
  title: {
    default: "agentscan — audit agent config before it fails silently",
    template: "%s · agentscan",
  },
  description:
    "Find broken agent configuration — hooks whose scripts are gone, MCP servers that cannot start, skills that disagree with their lockfile. 1.0.0, 59 checks. No AI, no network on check, writes nothing.",
  alternates: {
    canonical: "./",
    types: {
      "text/markdown": "./",
    },
  },
  openGraph: {
    title: "agentscan — audit agent config before it fails silently",
    description:
      "Find broken agent configuration — hooks whose scripts are gone, MCP servers that cannot start, skills that disagree with their lockfile. 1.0.0, 59 checks. No AI, no network on check, writes nothing.",
    url: "https://agentscan.space",
    siteName: "agentscan",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "agentscan — audit agent config before it fails silently",
    description:
      "Find broken agent configuration. 1.0.0, 59 checks. No AI, no network on check, writes nothing.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <SiteHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
