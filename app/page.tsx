"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import BubbleField, { ProjectBubbleData } from "@/components/bubble/BubbleField";
import { ROUNDS_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";

interface RoundSummary {
  id: bigint;
  name: string;
  organiser: string;
  endsAt: bigint;
  pool: bigint;
  finalized: boolean;
  isEnded: boolean;
  projects: ProjectBubbleData[];
  totalRaised: bigint;
  totalMatched: bigint;
}

export default function HomePage() {
  const { isConnected } = useAccount();
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const publicClient = usePublicClient({ chainId: activeBotChain.id });

  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!publicClient || !isDeployed) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadRounds() {
      try {
        const count = await publicClient!.readContract({
          address: contractAddress,
          abi: ROUNDS_ABI,
          functionName: "roundCount",
        });

        const total = Number(count);
        if (total === 0) {
          if (isMounted) {
            setRounds([]);
            setLoading(false);
          }
          return;
        }

        const now = BigInt(Math.floor(Date.now() / 1000));
        const list: RoundSummary[] = [];

        // Read up to 20 latest rounds
        const limit = Math.min(total, 20);
        for (let i = total; i > total - limit; i--) {
          const rId = BigInt(i);
          const [rData, pList, prev] = await Promise.all([
            publicClient!.readContract({
              address: contractAddress,
              abi: ROUNDS_ABI,
              functionName: "roundOf",
              args: [rId],
            }),
            publicClient!.readContract({
              address: contractAddress,
              abi: ROUNDS_ABI,
              functionName: "projectsOf",
              args: [rId],
            }),
            publicClient!.readContract({
              address: contractAddress,
              abi: ROUNDS_ABI,
              functionName: "preview",
              args: [rId],
            }),
          ]);

          const matches = prev[0] as bigint[];
          let totalRaised = 0n;
          let totalMatched = 0n;

          const projData: ProjectBubbleData[] = pList.map((p, idx) => {
            const m = matches[idx] || 0n;
            totalRaised += p.raised;
            totalMatched += m;
            return {
              index: idx,
              name: p.name,
              payee: p.payee,
              raised: p.raised,
              sqrtSum: p.sqrtSum,
              matchPreview: m,
            };
          });

          list.push({
            id: rId,
            name: rData.name,
            organiser: rData.organiser,
            endsAt: rData.endsAt,
            pool: BigInt(rData.pool),
            finalized: rData.finalized,
            isEnded: now >= rData.endsAt,
            projects: projData,
            totalRaised,
            totalMatched,
          });
        }

        if (isMounted) {
          setRounds(list);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load rounds:", err);
        if (isMounted) setLoading(false);
      }
    }

    loadRounds();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress]);

  const openRounds = rounds.filter((r) => !r.isEnded);
  const endedRounds = rounds.filter((r) => r.isEnded);

  return (
    <PageShell
      headline="Quadratic Match Fields"
      lead="Small gifts count more than big ones. Back projects you care about, and the quadratic matching pool magnifies crowd support."
    >
      <div className="flex flex-col gap-8">
        {/* Limits & Capabilities Panel (Spec §1, §3.4) */}
        <Panel
          tone="soft"
          title="What this formula can't see"
          subtitle="How quadratic funding works, what it rewards, and its mathematical limits"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans text-[var(--text-secondary)]">
            <div className="p-3.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <strong className="block text-[var(--text-primary)] font-heading uppercase tracking-wider mb-1">
                Counts Wallets, Not People
              </strong>
              It counts wallets, not people. Splitting a gift across wallets inflates the match. The more wallets, the more the formula is fooled.
            </div>
            <div className="p-3.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <strong className="block text-[var(--text-primary)] font-heading uppercase tracking-wider mb-1">
                Gifts Held Until Close
              </strong>
              Gifts are held until the round ends. Nobody, including the organiser, can take them early.
            </div>
            <div className="p-3.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              <strong className="block text-[var(--text-primary)] font-heading uppercase tracking-wider mb-1">
                Fixed Beneficiaries
              </strong>
              The projects and payees are whatever the organiser typed when opening the round.
            </div>
          </div>
        </Panel>

        {/* Action Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading text-xl font-bold text-[var(--text-primary)]">
              Active Funding Fields
            </h2>
            <p className="text-xs text-[var(--text-secondary)] font-sans">
              Each project's match grows with the number of people who gave, not only the total.
            </p>
          </div>
          <Link href="/new">
            <Button size="sm">Open a Round</Button>
          </Link>
        </div>

        {/* Loading / Empty States */}
        {loading ? (
          <Panel>
            <div className="py-16 text-center text-sm font-mono text-[var(--text-secondary)] animate-pulse">
              Scanning quadratic match fields on chain…
            </div>
          </Panel>
        ) : !isDeployed ? (
          <Panel>
            <div className="py-16 text-center text-sm text-[var(--warning)] font-sans">
              Rounds contract is not yet deployed on this network.
            </div>
          </Panel>
        ) : openRounds.length === 0 && endedRounds.length === 0 ? (
          <Panel>
            <div className="py-16 text-center flex flex-col items-center gap-3">
              <p className="text-sm text-[var(--text-secondary)] font-sans">
                No funding rounds have been opened yet. Be the first to start a quadratic pool!
              </p>
              <Link href="/new">
                <Button size="md">Open the First Round</Button>
              </Link>
            </div>
          </Panel>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Tiled field of mini-fields (one per round) (Spec §3.1) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {openRounds.map((rnd) => (
                <Link
                  key={rnd.id.toString()}
                  href={`/round/${rnd.id}`}
                  className="group no-underline block"
                >
                  <Panel
                    className="h-full hover:border-[var(--accent)] transition-all cursor-pointer"
                    title={
                      <div className="flex items-center justify-between w-full">
                        <span className="truncate pr-2">{rnd.name}</span>
                        <span className="text-[10px] font-heading uppercase px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--success)] font-bold shrink-0">
                          Active
                        </span>
                      </div>
                    }
                    subtitle={`Round #${rnd.id.toString()} • Match Pool: ${formatEther(rnd.pool)} BOT`}
                  >
                    <div className="flex flex-col gap-3">
                      {/* Mini Bubble Field */}
                      <BubbleField
                        projects={rnd.projects}
                        selectedProject={null}
                        onSelectProject={() => {}}
                        compact={true}
                      />

                      <div className="flex justify-between items-center text-xs font-mono pt-2 border-t border-[var(--border-subtle)] text-[var(--text-secondary)]">
                        <span>Raised: {formatEther(rnd.totalRaised)} BOT</span>
                        <span className="text-[var(--accent)] font-bold">
                          Matched: ~{formatEther(rnd.totalMatched)} BOT
                        </span>
                      </div>
                    </div>
                  </Panel>
                </Link>
              ))}
            </div>

            {/* Ended Rounds */}
            {endedRounds.length > 0 && (
              <div className="flex flex-col gap-4 mt-6">
                <h3 className="font-heading text-lg font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  Past Rounds
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {endedRounds.map((rnd) => (
                    <Link
                      key={rnd.id.toString()}
                      href={`/round/${rnd.id}`}
                      className="group no-underline block opacity-85 hover:opacity-100 transition-opacity"
                    >
                      <Panel className="h-full hover:border-[var(--border-strong)]">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="font-mono text-xs text-[var(--text-secondary)]">
                            Round #{rnd.id.toString()}
                          </span>
                          <span className="text-[10px] font-heading uppercase px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-bold">
                            {rnd.finalized ? "Finalized" : "Closed"}
                          </span>
                        </div>
                        <h4 className="font-heading text-base font-bold text-[var(--text-primary)] mb-1">
                          {rnd.name}
                        </h4>
                        <p className="text-xs font-mono text-[var(--text-secondary)]">
                          Pool: {formatEther(rnd.pool)} BOT • Raised: {formatEther(rnd.totalRaised)} BOT
                        </p>
                      </Panel>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
