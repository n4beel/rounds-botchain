"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { footerLinks } from "@/lib/botchain/chain";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export interface NavRoute {
  path: string;
  name: string;
}

interface PageShellProps {
  children: React.ReactNode;
  routes?: NavRoute[];
  headline?: string;
  lead?: string;
}

export default function PageShell({
  children,
  routes = [
    { path: "/", name: "Funding Rounds" },
    { path: "/new", name: "Open Round" },
    { path: "/me", name: "My Ledger" },
  ],
  headline,
  lead,
}: PageShellProps) {
  const links = footerLinks();
  const currentPath = usePathname();

  return (
    <div
      className="flex flex-col min-h-screen text-[var(--text-primary)]"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      <header
        className="sticky top-0 z-30 flex-shrink-0 backdrop-blur-md"
        style={{
          borderBottom: "1px solid var(--border-default)",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between py-3.5 gap-4">
            <Link href="/" className="flex items-center gap-3 no-underline group">
              <div
                className="w-4 h-4 rounded-full shadow-sm group-hover:scale-110 transition-transform"
                style={{ backgroundColor: "var(--accent)" }}
                aria-hidden="true"
              />
              <span className="font-heading text-xl font-bold tracking-tight text-[var(--text-primary)]">
                {app.name}
              </span>
            </Link>

            <nav className="hidden sm:flex items-center gap-2" aria-label="Desktop Navigation">
              {routes.map((r) => {
                const isActive = currentPath === r.path;
                return (
                  <Link
                    key={r.path}
                    href={r.path}
                    className={`px-3.5 py-1.5 text-xs font-semibold rounded-full font-sans transition-colors ${
                      isActive
                        ? "bg-[var(--accent)] text-[var(--accent-ink)] shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    {r.name}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-3">
              <NetworkBadge />
              <div className="w-[145px] sm:w-[175px]">
                <ConnectButton />
              </div>
            </div>
          </div>

          <div className="flex sm:hidden items-center justify-around pb-2.5 pt-1 border-t border-[var(--border-subtle)]">
            {routes.map((r) => {
              const isActive = currentPath === r.path;
              return (
                <Link
                  key={r.path}
                  href={r.path}
                  className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    isActive
                      ? "bg-[var(--accent)] text-[var(--accent-ink)] font-bold"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {r.name}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {(headline || lead) && (
          <div className="mb-6 space-y-1">
            {headline && (
              <h1 className="font-heading text-2xl md:text-3xl font-bold text-[var(--text-primary)]">
                {headline}
              </h1>
            )}
            {lead && (
              <p className="text-sm text-[var(--text-secondary)] font-sans max-w-3xl">
                {lead}
              </p>
            )}
          </div>
        )}
        {children}
      </main>

      <footer
        className="mt-auto border-t py-6 text-xs text-[var(--text-muted)]"
        style={{
          borderColor: "var(--border-default)",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 md:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-5 flex-wrap justify-center sm:justify-start">
            {links.contract && (
              <a
                href={links.contract}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-[var(--text-primary)] transition-colors"
              >
                Contract
              </a>
            )}
            <a
              href={links.site}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-[var(--text-primary)] transition-colors"
            >
              botchain.ai
            </a>
            <a
              href={links.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-[var(--text-primary)] transition-colors"
            >
              Explorer
            </a>
          </div>
          <BuiltOnBotChain />
        </div>
      </footer>
    </div>
  );
}
