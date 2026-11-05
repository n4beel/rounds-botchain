import type { Metadata, Viewport } from "next";
import { Bitter, Outfit, Geist_Mono } from "next/font/google";
import { EvmProvider } from "@/components/providers/EvmProvider";
import { ToastProvider } from "@/components/ui/Toast";
import WrongNetworkBar from "@/components/botchain/WrongNetworkBar";
import { app } from "@/lib/app-config";
import "./globals.css";

const bitter = Bitter({ variable: "--font-heading", subsets: ["latin"], display: "swap" });
const outfit = Outfit({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: `${app.name} — ${app.tagline}`,
  description: app.tagline,
  openGraph: { title: app.name, description: app.tagline, type: "website", url: app.url },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#86B83A",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bitter.variable} ${outfit.variable} ${geistMono.variable} h-full`}
      style={{ ["--accent" as string]: app.accent }}
    >
      <body className="min-h-full antialiased font-sans bg-[var(--bg-base)] text-[var(--text-primary)]">
        <EvmProvider>
          <WrongNetworkBar />
          <ToastProvider>{children}</ToastProvider>
        </EvmProvider>
      </body>
    </html>
  );
}
