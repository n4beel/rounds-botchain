"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { parseEther, isAddress } from "viem";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { useWriteContract } from "@/lib/useChainWrite";
import { useToast } from "@/components/ui/Toast";
import { ROUNDS_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import {
  MAX_PROJECTS,
  MAX_NAME_BYTES,
  MAX_PROJECT_NAME,
  MIN_DURATION,
  MAX_DURATION,
} from "@/lib/limits";
import { formatRoundsError } from "@/lib/errors";

interface ProjectEntry {
  name: string;
  payee: string;
}

export default function NewRoundPage() {
  const router = useRouter();
  const { address: userAddress, isConnected } = useAccount();
  const { toast } = useToast();
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const { writeContractAsync } = useWriteContract();

  const [name, setName] = useState("");
  const [poolAmount, setPoolAmount] = useState("5");
  const [durationHours, setDurationHours] = useState("48");
  const [projects, setProjects] = useState<ProjectEntry[]>([
    { name: "", payee: "" },
    { name: "", payee: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const nameBytes = new TextEncoder().encode(name).length;
  const isNameValid = name.trim().length > 0 && nameBytes <= MAX_NAME_BYTES;

  const durationSecs = Number(durationHours) * 3600;
  const isDurationValid =
    !isNaN(durationSecs) &&
    durationSecs >= MIN_DURATION &&
    durationSecs <= MAX_DURATION;

  const poolWei = parseFloat(poolAmount) > 0 ? parseEther(poolAmount) : 0n;
  const isPoolValid = poolWei > 0n;

  const areProjectsValid =
    projects.length >= 1 &&
    projects.length <= MAX_PROJECTS &&
    projects.every(
      (p) =>
        p.name.trim().length > 0 &&
        new TextEncoder().encode(p.name).length <= MAX_PROJECT_NAME &&
        isAddress(p.payee) &&
        p.payee.toLowerCase() !== userAddress?.toLowerCase() &&
        p.payee !== "0x0000000000000000000000000000000000000000"
    );

  const canSubmit =
    isConnected &&
    isDeployed &&
    isNameValid &&
    isPoolValid &&
    isDurationValid &&
    areProjectsValid &&
    !submitting;

  const handleAddProject = () => {
    if (projects.length < MAX_PROJECTS) {
      setProjects([...projects, { name: "", payee: "" }]);
    }
  };

  const handleRemoveProject = (index: number) => {
    if (projects.length > 1) {
      setProjects(projects.filter((_, i) => i !== index));
    }
  };

  const handleProjectChange = (
    index: number,
    field: "name" | "payee",
    value: string
  ) => {
    const updated = [...projects];
    updated[index][field] = value;
    setProjects(updated);
  };

  const handleOpenRound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      // Use chain time, not the browser clock: the contract checks the length against
      // the block timestamp at mining time, which is later than any time read now.
      // A ten-minute margin (block age plus time in the wallet prompt) keeps the round at least MIN_DURATION long when mined.
      const block = publicClient ? await publicClient.getBlock() : null;
      const chainNow = block ? Number(block.timestamp) : Math.floor(Date.now() / 1000);
      const endsAt = BigInt(
        Math.min(chainNow + durationSecs + 600, chainNow + MAX_DURATION)
      );
      const projectNames = projects.map((p) => p.name.trim());
      const payees = projects.map((p) => p.payee.trim() as `0x${string}`);

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: ROUNDS_ABI,
        functionName: "open",
        args: [name.trim(), endsAt, projectNames, payees],
        value: poolWei,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      toast("success", "Round Opened!", `Created "${name.trim()}" with ${projects.length} projects`);
      setTimeout(() => {
        router.push("/");
      }, 1200);
    } catch (err) {
      toast("error", "Failed to open round", formatRoundsError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      headline="Open a Quadratic Round"
      lead="Deposit a matching pool and specify up to 8 recipient projects. The matching pool will be distributed quadratically based on unique donor contributions."
    >
      <div className="max-w-2xl mx-auto">
        <Panel tone="default">
          <form onSubmit={handleOpenRound} className="flex flex-col gap-6">
            {/* Round Name */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs">
                <label
                  htmlFor="round-name"
                  className="font-heading uppercase tracking-wider font-bold text-[var(--text-primary)]"
                >
                  Round Name
                </label>
                <span
                  className={`font-mono ${
                    nameBytes > MAX_NAME_BYTES
                      ? "text-[var(--danger)]"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {nameBytes} / {MAX_NAME_BYTES} bytes
                </span>
              </div>
              <input
                id="round-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Core Protocol Tooling Grants"
                maxLength={48}
                required
                className="w-full px-3.5 py-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] text-sm font-sans"
              />
            </div>

            {/* Match Pool & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="pool-amount"
                  className="font-heading text-xs uppercase tracking-wider font-bold text-[var(--text-primary)]"
                >
                  Match Pool (BOT)
                </label>
                <input
                  id="pool-amount"
                  type="number"
                  step="any"
                  min="0.001"
                  value={poolAmount}
                  onChange={(e) => setPoolAmount(e.target.value)}
                  placeholder="5.0"
                  required
                  className="w-full px-3.5 py-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] text-sm font-mono"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label
                  htmlFor="duration-hours"
                  className="font-heading text-xs uppercase tracking-wider font-bold text-[var(--text-primary)]"
                >
                  Duration (Hours)
                </label>
                <input
                  id="duration-hours"
                  type="number"
                  step="any"
                  min="1"
                  max="2160"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] text-sm font-mono"
                />
                <span className="text-[10px] text-[var(--text-muted)]">
                  Counted from when the transaction confirms; about ten minutes are added to cover confirmation time.
                </span>
              </div>
            </div>

            {/* Projects list */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-heading uppercase tracking-wider font-bold text-[var(--text-primary)]">
                  Projects ({projects.length} / {MAX_PROJECTS})
                </span>
                <span className="text-[var(--text-secondary)] font-sans">
                  Payees cannot be your own wallet
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {projects.map((proj, idx) => {
                  const pNameBytes = new TextEncoder().encode(proj.name).length;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-heading uppercase tracking-wider font-bold text-[var(--text-secondary)]">
                          Project #{idx + 1}
                        </span>
                        {projects.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveProject(idx)}
                            className="text-[var(--danger)] hover:underline font-mono text-xs"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={proj.name}
                          onChange={(e) =>
                            handleProjectChange(idx, "name", e.target.value)
                          }
                          placeholder="Project name (max 40 bytes)"
                          maxLength={40}
                          required
                          className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-sans"
                        />
                        <input
                          type="text"
                          value={proj.payee}
                          onChange={(e) =>
                            handleProjectChange(idx, "payee", e.target.value)
                          }
                          placeholder="Payee address (0x…)"
                          required
                          className="w-full px-3 py-2 rounded bg-[var(--bg-surface)] border border-[var(--border-default)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {projects.length < MAX_PROJECTS && (
                <button
                  type="button"
                  onClick={handleAddProject}
                  className="self-start text-xs font-heading uppercase tracking-wider font-bold text-[var(--accent)] hover:underline cursor-pointer"
                >
                  + Add Another Project
                </button>
              )}
            </div>

            {/* Validation & Submit */}
            <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col gap-3">
              {!isConnected ? (
                <p className="text-xs text-[var(--warning)] font-sans text-center">
                  Connect your wallet to open a round.
                </p>
              ) : !isNameValid ? (
                <p className="text-xs text-[var(--text-secondary)] font-sans text-center">
                  Please provide a valid round title (up to 48 bytes).
                </p>
              ) : !isPoolValid ? (
                <p className="text-xs text-[var(--text-secondary)] font-sans text-center">
                  Match pool must be greater than 0 BOT.
                </p>
              ) : !areProjectsValid ? (
                <p className="text-xs text-[var(--text-secondary)] font-sans text-center">
                  Ensure all project names are non-empty and payees are valid external addresses.
                </p>
              ) : null}

              <Button
                type="submit"
                disabled={!canSubmit}
                loading={submitting}
                size="lg"
                className="w-full"
              >
                Deposit Pool & Open Round ({poolAmount} BOT)
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
