"use client";

import { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  tag?: ReactNode;
  headerAction?: ReactNode;
  tone?: "default" | "highlight" | "soft";
}

export default function Panel({
  title,
  subtitle,
  tag,
  headerAction,
  tone = "default",
  children,
  className = "",
  style,
  ...props
}: PanelProps) {
  const bg =
    tone === "highlight"
      ? "var(--bg-elevated)"
      : tone === "soft"
      ? "var(--bg-overlay)"
      : "var(--bg-surface)";

  const customStyle: CSSProperties = {
    background: bg,
    border: "1px solid var(--border-default)",
    boxShadow: "0 1px 3px rgba(14, 26, 2, 0.06)",
    ...style,
  };

  return (
    <article
      className={`rounded-md p-5 sm:p-6 transition-shadow ${className}`}
      style={customStyle}
      {...props}
    >
      {(title || subtitle || tag || headerAction) && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3.5 border-b border-[var(--border-subtle)]">
          <div className="space-y-0.5">
            {title && (
              <h2 className="font-heading text-xl font-bold tracking-tight text-[var(--text-primary)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-[var(--text-secondary)] font-sans">
                {subtitle}
              </p>
            )}
          </div>
          {(tag || headerAction) && (
            <div className="flex items-center gap-2">
              {tag}
              {headerAction}
            </div>
          )}
        </div>
      )}
      <div className="text-[var(--text-primary)]">{children}</div>
    </article>
  );
}
