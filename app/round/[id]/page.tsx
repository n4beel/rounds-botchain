"use client";

import { use, useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther, parseEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import BubbleField, { ProjectBubbleData } from "@/components/bubble/BubbleField";
import { ROUNDS_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { useWriteContract } from "@/lib/useChainWrite";
import { useToast } from "@/components/ui/Toast";
import { formatAddress } from "@/lib/rounds";
import { formatRoundsError } from "@/lib/errors";

interface RoundDetail {
  organiser: string;
  endsAt: bigint;
  projectCount: number;
  finalized: boolean;
  pool: bigint;
  name: string;
}

export default function RoundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const roundId = BigInt(id);

  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();

  const [round, setRound] = useState<RoundDetail | null>(null);
  const [projects, setProjects] = useState<ProjectBubbleData[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [userGiven, setUserGiven] = useState<bigint>(0n);
  const [donorCount, setDonorCount] = useState<number>(0);

  const [giftAmount, setGiftAmount] = useState("0.1");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refreshRound() {
    if (!publicClient || !isDeployed) return;

    try {
      const [rData, pList, prev] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: ROUNDS_ABI,
          functionName: "roundOf",
          args: [roundId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: ROUNDS_ABI,
          functionName: "projectsOf",
          args: [roundId],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: ROUNDS_ABI,
          functionName: "preview",
          args: [roundId],
        }),
      ]);

      const matches = prev[0] as bigint[];
      const pData: ProjectBubbleData[] = pList.map((p, idx) => ({
        index: idx,
        name: p.name,
        payee: p.payee,
        raised: p.raised,
        sqrtSum: p.sqrtSum,
        matchPreview: matches[idx] || 0n,
      }));

      setRound({
        organiser: rData.organiser,
        endsAt: rData.endsAt,
        projectCount: rData.projectCount,
        finalized: rData.finalized,
        pool: BigInt(rData.pool),
        name: rData.name,
      });
      setProjects(pData);
      if (selectedIdx === null && pData.length > 0) {
        setSelectedIdx(0);
      }

      // Check user standing on selected project
      if (userAddress && selectedIdx !== null && selectedIdx < pData.length) {
        const given = await publicClient.readContract({
          address: contractAddress,
          abi: ROUNDS_ABI,
          functionName: "givenBy",
          args: [roundId, uint8(selectedIdx), userAddress],
        });
        setUserGiven(BigInt(given));
      }

      // Count unique donors from Gave events
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n;
      const gaveLogs = await publicClient.getLogs({
        address: contractAddress,
        event: {
          type: "event",
          name: "Gave",
          inputs: [
            { indexed: true, name: "id", type: "uint256" },
            { indexed: true, name: "project", type: "uint8" },
            { indexed: true, name: "donor", type: "address" },
            { indexed: false, name: "amount", type: "uint256" },
            { indexed: false, name: "donorTotal", type: "uint256" },
          ],
        },
        args: { id: roundId },
        fromBlock,
      });

      const uniqueDonorsForSelected = new Set(
        gaveLogs
          .filter((l) => l.args && l.args.project === (selectedIdx ?? 0))
          .map((l) => l.args?.donor?.toLowerCase())
      );
      setDonorCount(uniqueDonorsForSelected.size);
    } catch (err) {
      console.error("Failed to refresh round:", err);
    } finally {
      setLoading(false);
    }
  }

  function uint8(n: number): number {
    return n & 0xff;
  }

  useEffect(() => {
    let isMounted = true;
    if (publicClient && isDeployed) {
      refreshRound();
    } else {
      setLoading(false);
    }
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, userAddress, roundId, selectedIdx]);

  const now = BigInt(Math.floor(Date.now() / 1000));
  const isEnded = round ? now >= round.endsAt : false;
  const isFinalized = round ? round.finalized : false;

  const selectedProj =
    selectedIdx !== null && projects[selectedIdx]
      ? projects[selectedIdx]
      : null;

  const isOrganiser =
    userAddress && round
      ? userAddress.toLowerCase() === round.organiser.toLowerCase()
      : false;
  const isPayee =
    userAddress && selectedProj
      ? userAddress.toLowerCase() === selectedProj.payee.toLowerCase()
      : false;

  const handleGive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIdx === null || !selectedProj || !isDeployed) return;

    try {
      setSubmitting(true);
      const valWei = parseEther(giftAmount);

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: ROUNDS_ABI,
        functionName: "give",
        args: [roundId, selectedIdx],
        value: valWei,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      toast(
        "success",
        "Gift Received!",
        `Contributed ${giftAmount} BOT to ${selectedProj.name}`
      );
      await refreshRound();
    } catch (err) {
      toast("error", "Contribution failed", formatRoundsError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalize = async () => {
    if (!isDeployed) return;
    try {
      setSubmitting(true);
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: ROUNDS_ABI,
        functionName: "finalize",
        args: [roundId],
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      toast("success", "Round Finalized", "Funds allocated to payees");
      await refreshRound();
    } catch (err) {
      toast("error", "Finalize failed", formatRoundsError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageShell headline="Loading Round...">
        <Panel>
          <div className="py-16 text-center text-sm font-mono text-[var(--text-secondary)] animate-pulse">
            Loading round details and calculating quadratic match pool…
          </div>
        </Panel>
      </PageShell>
    );
  }

  if (!round) {
    return (
      <PageShell headline="Round Not Found">
        <Panel>
          <div className="py-16 text-center text-sm text-[var(--text-secondary)] font-sans">
            Could not find round #{roundId.toString()} on this contract.
          </div>
        </Panel>
      </PageShell>
    );
  }

  const totalRaised = projects.reduce((sum, p) => sum + p.raised, 0n);
  const totalMatches = projects.reduce((sum, p) => sum + p.matchPreview, 0n);

  return (
    <PageShell
      headline={`Round #${roundId.toString()}: ${round.name}`}
      lead={
        isFinalized
          ? "This round has been finalized. All gifts and match funds have been disbursed to project payees."
          : isEnded
          ? "This round has ended. Finalization is open to anyone to settle and release the allocations."
          : `Matching pool of ${formatEther(round.pool)} BOT active until ${new Date(
              Number(round.endsAt) * 1000
            ).toLocaleString()}.`
      }
    >
      <div className="flex flex-col gap-6">
        {/* Pool Bar & Status */}
        <Panel tone="soft">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="font-heading text-xs uppercase tracking-wider text-[var(--text-secondary)] font-bold block">
                Quadratic Pool Status
              </span>
              <div className="flex items-center gap-4 text-xs font-mono">
                <span>Matching Pool: <strong className="text-[var(--text-primary)]">{formatEther(round.pool)} BOT</strong></span>
                <span>•</span>
                <span>Total Gifts: <strong className="text-[var(--text-primary)]">{formatEther(totalRaised)} BOT</strong></span>
                <span>•</span>
                <span className="text-[var(--accent)] font-bold">Allocated: ~{formatEther(totalMatches)} BOT</span>
              </div>
            </div>

            {isEnded && !isFinalized && (
              <Button
                variant="primary"
                size="md"
                loading={submitting}
                onClick={handleFinalize}
              >
                Finalize & Disburse Allocations
              </Button>
            )}
          </div>
        </Panel>

        {/* SVG Bubble Field */}
        <Panel
          title="Interactive Project Field"
          subtitle="Click on any project bubble to review its match preview or contribute directly"
        >
          <BubbleField
            projects={projects}
            selectedProject={selectedIdx}
            onSelectProject={(idx) => setSelectedIdx(idx)}
          />
        </Panel>

        {/* Side / Action Panel for Selected Project */}
        {selectedProj && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Project Details & Formula Line (Spec §3.1) */}
            <Panel
              title={selectedProj.name}
              subtitle={`Payee: ${formatAddress(selectedProj.payee)}`}
            >
              <div className="flex flex-col gap-4 text-xs font-sans text-[var(--text-secondary)]">
                {/* Plain-language formula line per spec §3.1 */}
                <div className="p-3.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                  <span className="font-heading text-sm font-bold block mb-1">
                    Funding Breakdown
                  </span>
                  <p>
                    {donorCount} {donorCount === 1 ? "person has" : "people have"} given{" "}
                    <strong>{formatEther(selectedProj.raised)} BOT</strong>; the formula adds about{" "}
                    <strong className="text-[var(--accent)]">
                      {formatEther(selectedProj.matchPreview)} BOT
                    </strong>{" "}
                    from the match pool.
                  </p>
                </div>

                <div className="space-y-1.5 font-mono">
                  <div className="flex justify-between">
                    <span>Direct Gifts Raised:</span>
                    <span className="font-bold text-[var(--text-primary)]">{formatEther(selectedProj.raised)} BOT</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Current Match Estimate:</span>
                    <span className="font-bold text-[var(--accent)]">+{formatEther(selectedProj.matchPreview)} BOT</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[var(--border-subtle)] font-bold">
                    <span>Total Projected Funding:</span>
                    <span className="text-[var(--success)]">
                      {formatEther(selectedProj.raised + selectedProj.matchPreview)} BOT
                    </span>
                  </div>
                </div>

                {userGiven > 0n && (
                  <div className="p-2.5 rounded bg-[var(--bg-overlay)] border border-[var(--border-default)] font-mono text-[11px] text-[var(--text-primary)]">
                    You have personally contributed <strong>{formatEther(userGiven)} BOT</strong> to this project. You may give again to increase its match.
                  </div>
                )}
              </div>
            </Panel>

            {/* Gift Form */}
            {!isEnded && isConnected && (
              <Panel
                title="Back this Project"
                subtitle="Your gift will directly increase this project's matching subsidy"
              >
                {isOrganiser || isPayee ? (
                  <div className="py-6 text-center text-xs text-[var(--warning)] font-sans">
                    The organiser and a project's payee can't give to that project.
                  </div>
                ) : (
                  <form onSubmit={handleGive} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-xs">
                        <label
                          htmlFor="gift-amount"
                          className="font-heading uppercase tracking-wider font-bold text-[var(--text-primary)]"
                        >
                          Contribution Amount (BOT)
                        </label>
                        <span className="text-[var(--text-secondary)] font-sans">
                          Min 0.001 BOT
                        </span>
                      </div>
                      <input
                        id="gift-amount"
                        type="number"
                        step="any"
                        min="0.001"
                        value={giftAmount}
                        onChange={(e) => setGiftAmount(e.target.value)}
                        placeholder="0.1"
                        required
                        className="w-full px-3.5 py-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={submitting || parseFloat(giftAmount) < 0.001}
                      loading={submitting}
                      size="md"
                      className="w-full"
                    >
                      Give {giftAmount} BOT
                    </Button>
                  </form>
                )}
              </Panel>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
