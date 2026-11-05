"use client";

import { useState } from "react";
import { formatEther } from "viem";
import { bubbleRadius, formatAddress } from "@/lib/rounds";

export interface ProjectBubbleData {
  index: number;
  name: string;
  payee: string;
  raised: bigint;
  sqrtSum: bigint;
  matchPreview: bigint;
}

interface BubbleFieldProps {
  projects: ProjectBubbleData[];
  selectedProject: number | null;
  onSelectProject: (index: number) => void;
  compact?: boolean;
}

export default function BubbleField({
  projects,
  selectedProject,
  onSelectProject,
  compact = false,
}: BubbleFieldProps) {
  const [viewTable, setViewTable] = useState(false);

  // Compute maximum ideal funding for relative sizing
  const maxIdeal = projects.reduce((max, p) => {
    const ideal = p.sqrtSum * p.sqrtSum;
    return ideal > max ? ideal : max;
  }, 0n);

  // Layout positions for SVG field (circle pack approximation in 720x400 canvas)
  const count = projects.length;
  const positions = [
    { x: 360, y: 190 }, // center
    { x: 200, y: 130 },
    { x: 520, y: 130 },
    { x: 190, y: 280 },
    { x: 530, y: 280 },
    { x: 360, y: 320 },
    { x: 80, y: 200 },
    { x: 640, y: 200 },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Table Toggle Header */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text-secondary)] font-sans">
          {projects.length} project{projects.length === 1 ? "" : "s"} in round • Bubbles sized by formula match power
        </span>
        <button
          type="button"
          onClick={() => setViewTable(!viewTable)}
          className="font-heading uppercase tracking-wider text-[var(--accent)] font-bold hover:underline cursor-pointer"
          aria-pressed={viewTable}
        >
          {viewTable ? "View Bubble Field" : "View Accessible Table"}
        </button>
      </div>

      {viewTable ? (
        /* Accessible Table Equivalent (Spec §8.3) */
        <div className="overflow-x-auto rounded border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <table className="w-full text-left text-xs font-sans">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-heading uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3.5">#</th>
                <th className="py-2.5 px-3.5">Project</th>
                <th className="py-2.5 px-3.5">Payee</th>
                <th className="py-2.5 px-3.5 text-right">Gifts Raised</th>
                <th className="py-2.5 px-3.5 text-right">Estimated Match</th>
                <th className="py-2.5 px-3.5 text-right">Total Funding</th>
                <th className="py-2.5 px-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
              {projects.map((p) => {
                const total = p.raised + p.matchPreview;
                const isSelected = selectedProject === p.index;
                return (
                  <tr
                    key={p.index}
                    className={`hover:bg-[var(--bg-elevated)]/50 transition-colors ${
                      isSelected ? "bg-[var(--bg-elevated)]" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3.5 text-[var(--text-muted)]">{p.index + 1}</td>
                    <td className="py-2.5 px-3.5 font-sans font-bold text-[var(--text-primary)]">
                      {p.name}
                    </td>
                    <td className="py-2.5 px-3.5 text-[var(--text-secondary)]">
                      {formatAddress(p.payee)}
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-[var(--text-primary)]">
                      {formatEther(p.raised)} BOT
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-[var(--accent)] font-bold">
                      +{formatEther(p.matchPreview)} BOT
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-bold text-[var(--success)]">
                      {formatEther(total)} BOT
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectProject(p.index)}
                        className="text-[11px] font-heading uppercase text-[var(--accent)] hover:underline font-bold"
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* SVG Bubble Field (Spec §3.1, §8.3) */
        <div className="relative rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 sm:p-4 overflow-hidden shadow-inner">
          <div className="w-full flex justify-center">
            <svg
              viewBox={compact ? "0 0 600 240" : "0 0 720 380"}
              className="w-full h-auto max-h-[380px] select-none"
              aria-label="Quadratic funding bubble field diagram"
            >
              <defs>
                <radialGradient id="bubbleGrad" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                  <stop offset="60%" stopColor="var(--bg-elevated)" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="var(--border-default)" stopOpacity="0.9" />
                </radialGradient>
                <radialGradient id="selectedGrad" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                  <stop offset="50%" stopColor="#FF85A1" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.9" />
                </radialGradient>
              </defs>

              {projects.map((p, i) => {
                const pos = positions[i % positions.length];
                const ideal = p.sqrtSum * p.sqrtSum;
                const r = compact
                  ? bubbleRadius(ideal, maxIdeal, 24, 52)
                  : bubbleRadius(ideal, maxIdeal, 38, 88);

                const isSelected = selectedProject === p.index;

                // Portion of radius that represents gifts vs match
                const totalEstimated = p.raised + p.matchPreview;
                const giftRatio =
                  totalEstimated > 0n
                    ? Math.sqrt(Number(p.raised) / Number(totalEstimated))
                    : 0.5;
                const innerR = Math.max(12, r * giftRatio);

                return (
                  <g
                    key={p.index}
                    transform={`translate(${compact ? pos.x * 0.8 + 20 : pos.x}, ${
                      compact ? pos.y * 0.6 + 10 : pos.y
                    })`}
                    className="cursor-pointer group bubble-floating"
                    onClick={() => onSelectProject(p.index)}
                  >
                    {/* Outer Match Bubble */}
                    <circle
                      r={r}
                      fill={isSelected ? "url(#selectedGrad)" : "url(#bubbleGrad)"}
                      stroke={isSelected ? "var(--accent)" : "var(--border-strong)"}
                      strokeWidth={isSelected ? 3 : 1.5}
                      className="transition-all duration-300 group-hover:stroke-[var(--accent)]"
                    />

                    {/* Inner Gifts Ring (spec §3.1) */}
                    <circle
                      r={innerR}
                      fill="none"
                      stroke={isSelected ? "var(--accent-ink)" : "var(--border-default)"}
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      opacity="0.8"
                    />

                    {/* Label & Numbers */}
                    <text
                      y={-6}
                      textAnchor="middle"
                      fill="var(--text-primary)"
                      fontSize={r > 50 ? 13 : 11}
                      fontWeight="bold"
                      fontFamily="var(--font-heading)"
                      pointerEvents="none"
                    >
                      {p.name.length > 15 ? `${p.name.slice(0, 14)}…` : p.name}
                    </text>

                    <text
                      y={12}
                      textAnchor="middle"
                      fill="var(--text-secondary)"
                      fontSize={r > 50 ? 10 : 9}
                      fontFamily="var(--font-mono)"
                      pointerEvents="none"
                    >
                      Raised: {formatEther(p.raised)} BOT
                    </text>

                    {p.matchPreview > 0n && (
                      <text
                        y={24}
                        textAnchor="middle"
                        fill="var(--accent)"
                        fontSize={r > 50 ? 10 : 9}
                        fontWeight="bold"
                        fontFamily="var(--font-mono)"
                        pointerEvents="none"
                      >
                        +{formatEther(p.matchPreview)} match
                      </text>
                    )}

                    <title>{`${p.name} (Raised: ${formatEther(p.raised)} BOT, Match: ${formatEther(
                      p.matchPreview
                    )} BOT)`}</title>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Sizing Explainer Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] font-sans">
            <span>Outer bubble area = Total projected funding (gifts + quadratic match)</span>
            <span>Inner dashed ring = Direct gifts portion</span>
          </div>
        </div>
      )}
    </div>
  );
}
