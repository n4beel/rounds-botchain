"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatEther } from "viem";
import PageShell from "@/components/layout/PageShell";
import Panel from "@/components/ui/Panel";
import Button from "@/components/ui/Button";
import { ROUNDS_ABI } from "@/lib/botchain/abi";
import { activeBotChain } from "@/lib/botchain/chain";
import { getDeployment } from "@/lib/botchain/deployment";
import { useWriteContract } from "@/lib/useChainWrite";
import { useToast } from "@/components/ui/Toast";
import { formatAddress } from "@/lib/rounds";
import { formatRoundsError } from "@/lib/errors";

interface MyGiftRecord {
  roundId: bigint;
  roundName: string;
  projectName: string;
  givenAmount: bigint;
}

export default function MyLedgerPage() {
  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: activeBotChain.id });
  const deployment = getDeployment(activeBotChain.id);
  const contractAddress = deployment.address;
  const isDeployed = contractAddress !== "0x0000000000000000000000000000000000000000";

  const { toast } = useToast();
  const { writeContractAsync } = useWriteContract();

  const [pendingBalance, setPendingBalance] = useState<bigint>(0n);
  const [gifts, setGifts] = useState<MyGiftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);

  async function fetchUserLedger() {
    if (!publicClient || !isDeployed || !userAddress) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch pending withdrawable balance
      const pend = await publicClient.readContract({
        address: contractAddress,
        abi: ROUNDS_ABI,
        functionName: "pending",
        args: [userAddress],
      });
      setPendingBalance(BigInt(pend));

      // 2. Scan rounds where user has given
      const count = await publicClient.readContract({
        address: contractAddress,
        abi: ROUNDS_ABI,
        functionName: "roundCount",
      });

      const total = Number(count);
      const giftList: MyGiftRecord[] = [];

      for (let i = total; i >= 1; i--) {
        const rId = BigInt(i);
        const [rData, pList] = await Promise.all([
          publicClient.readContract({
            address: contractAddress,
            abi: ROUNDS_ABI,
            functionName: "roundOf",
            args: [rId],
          }),
          publicClient.readContract({
            address: contractAddress,
            abi: ROUNDS_ABI,
            functionName: "projectsOf",
            args: [rId],
          }),
        ]);

        for (let pIdx = 0; pIdx < pList.length; pIdx++) {
          const given = await publicClient.readContract({
            address: contractAddress,
            abi: ROUNDS_ABI,
            functionName: "givenBy",
            args: [rId, pIdx, userAddress],
          });

          if (BigInt(given) > 0n) {
            giftList.push({
              roundId: rId,
              roundName: rData.name,
              projectName: pList[pIdx].name,
              givenAmount: BigInt(given),
            });
          }
        }
      }

      setGifts(giftList);
    } catch (err) {
      console.error("Failed to fetch user ledger:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    if (publicClient && isDeployed && userAddress) {
      fetchUserLedger();
    } else {
      setLoading(false);
    }
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractAddress, userAddress]);

  const handleWithdraw = async () => {
    if (!isDeployed || pendingBalance === 0n) return;
    try {
      setWithdrawing(true);
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: ROUNDS_ABI,
        functionName: "withdraw",
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      toast("success", "Withdrawal Complete", `Received ${formatEther(pendingBalance)} BOT`);
      await fetchUserLedger();
    } catch (err) {
      toast("error", "Withdrawal failed", formatRoundsError(err));
    } finally {
      setWithdrawing(false);
    }
  };

  if (!isConnected) {
    return (
      <PageShell
        headline="My Grants & Ledger"
        lead="Inspect your contributions, match returns, and withdraw any pending allocations."
      >
        <Panel tone="default">
          <div className="py-16 text-center text-xs text-[var(--text-secondary)] font-sans">
            Connect your wallet to inspect your gifts and claimable grant payouts.
          </div>
        </Panel>
      </PageShell>
    );
  }

  return (
    <PageShell
      headline="My Grants & Ledger"
      lead={`Activity overview for ${formatAddress(userAddress || "")}: direct contributions and ready-to-claim funds.`}
    >
      <div className="flex flex-col gap-6">
        {/* Pending Payout Banner */}
        <Panel tone="highlight">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-heading uppercase tracking-wider text-[var(--text-secondary)] block">
                Available to Withdraw
              </span>
              <span className="font-mono text-2xl font-bold text-[var(--text-primary)]">
                {formatEther(pendingBalance)} BOT
              </span>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 font-sans">
                Accumulated payouts from finalized rounds where you are a project payee or organiser.
              </p>
            </div>

            <Button
              size="md"
              disabled={pendingBalance === 0n || withdrawing}
              loading={withdrawing}
              onClick={handleWithdraw}
            >
              Withdraw All
            </Button>
          </div>
        </Panel>

        {/* Gift History */}
        <Panel
          title="My Contributions"
          subtitle="All quadratic gifts you have made across open and closed rounds"
        >
          {loading ? (
            <div className="py-12 text-center text-xs font-mono text-[var(--text-secondary)] animate-pulse">
              Querying contributions from contract logs…
            </div>
          ) : gifts.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center gap-3 text-xs text-[var(--text-secondary)] font-sans">
              <p>You haven't backed any projects yet.</p>
              <Link href="/">
                <Button size="sm">Browse Funding Fields</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <table className="w-full text-left text-xs font-sans">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-heading uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Round</th>
                    <th className="py-2.5 px-3">Project</th>
                    <th className="py-2.5 px-3 text-right">Your Contribution</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {gifts.map((g, idx) => (
                    <tr key={idx} className="hover:bg-[var(--bg-elevated)]/40">
                      <td className="py-2.5 px-3 font-sans font-bold text-[var(--text-primary)]">
                        {g.roundName}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-[var(--text-secondary)]">
                        {g.projectName}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-[var(--text-primary)]">
                        {formatEther(g.givenAmount)} BOT
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          href={`/round/${g.roundId.toString()}`}
                          className="font-heading uppercase text-xs text-[var(--accent)] hover:underline font-bold"
                        >
                          View Field
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
