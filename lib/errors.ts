// lib/errors.ts - Formats Rounds contract errors per spec §4

import { formatEther } from "viem";

export function formatRoundsError(error: unknown): string {
  if (!error) return "An unknown error occurred.";
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("BadGift")) {
    return "Gifts are between 0.001 and 1,000,000 BOT.";
  }
  if (message.includes("SelfGive")) {
    return "The organiser and a project's payee can't give to that project.";
  }
  if (message.includes("StillOpen")) {
    return "This round is still open. Finalization can only happen after the round ends.";
  }
  if (message.includes("AlreadyFinalized")) {
    return "This round has already been finalized.";
  }
  if (message.includes("ZeroPool")) {
    return "Round pool must be greater than zero.";
  }
  if (message.includes("BadPool")) {
    return "Round pool exceeds the maximum allowed limit.";
  }
  if (message.includes("BadProjects")) {
    return "Projects list must contain 1 to 8 valid projects with distinct non-organiser payees.";
  }
  if (message.includes("BadEnd")) {
    return "Round duration must be between 1 hour and 90 days.";
  }
  if (message.includes("Ended")) {
    return "This round has ended. No more gifts can be accepted.";
  }
  if (message.includes("NoSuchRound")) {
    return "Round not found.";
  }
  if (message.includes("NoSuchProject")) {
    return "Project not found in this round.";
  }
  if (message.includes("NothingToWithdraw")) {
    return "No pending funds available to withdraw.";
  }
  if (message.includes("TransferFailed")) {
    return "Transfer failed. Please check recipient wallet or gas.";
  }

  return message;
}
