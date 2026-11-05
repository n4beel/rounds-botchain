import { describe, it, expect } from "vitest";
import { isqrt, idealMatch, allocate, bubbleRadius } from "../rounds";
import { formatRoundsError } from "../errors";

describe("Rounds lib tests", () => {
  it("computes exact integer square roots and matches floor property", () => {
    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(1n)).toBe(1n);
    expect(isqrt(4n)).toBe(2n);
    expect(isqrt(9n)).toBe(3n);
    expect(isqrt(10n)).toBe(3n);
    expect(isqrt(15n)).toBe(3n);
    expect(isqrt(16n)).toBe(4n);
    expect(isqrt(100n)).toBe(10n);
    expect(isqrt(1000000000000000000n)).toBe(1000000000n); // 1 ether (1e18) -> 1e9
  });

  it("calculates ideal match properly", () => {
    // Single donor of 4 ether: sqrt(4e18) = 2e9. sqrtSum = 2e9.
    // s2 = 4e18. ideal = 4e18 - 4e18 = 0.
    const raised1 = 4n * 10n ** 18n;
    const sqrtSum1 = isqrt(raised1);
    expect(idealMatch(sqrtSum1, raised1)).toBe(0n);

    // 4 donors of 1 ether: sqrtSum = 4 * 1e9 = 4e9.
    // s2 = 16e18. raised = 4e18. ideal = 12e18.
    const raised2 = 4n * 10n ** 18n;
    const sqrtSum2 = 4n * isqrt(10n ** 18n);
    expect(idealMatch(sqrtSum2, raised2)).toBe(12n * 10n ** 18n);
  });

  it("allocates match pool when pool is large enough (many small vs one big)", () => {
    const pool = 100n * 10n ** 18n; // 100 BOT
    const p0 = { raised: 4n * 10n ** 18n, sqrtSum: isqrt(4n * 10n ** 18n) }; // 1 big donor
    const p1 = { raised: 4n * 10n ** 18n, sqrtSum: 4n * isqrt(10n ** 18n) }; // 4 small donors

    const result = allocate(pool, [p0, p1]);
    expect(result.matches[0]).toBe(0n);
    expect(result.matches[1]).toBe(12n * 10n ** 18n);
    expect(result.totalMatched).toBe(12n * 10n ** 18n);
    expect(result.returned).toBe(88n * 10n ** 18n);
  });

  it("scales down match pool when ideal matches exceed pool", () => {
    const pool = 6n * 10n ** 18n; // 6 BOT pool
    // 2 projects each with 12 BOT ideal match
    const p0 = { raised: 4n * 10n ** 18n, sqrtSum: 4n * isqrt(10n ** 18n) };
    const p1 = { raised: 4n * 10n ** 18n, sqrtSum: 4n * isqrt(10n ** 18n) };

    const result = allocate(pool, [p0, p1]);
    // Each should receive 3 BOT (proportional scaling)
    expect(result.matches[0]).toBe(3n * 10n ** 18n);
    expect(result.matches[1]).toBe(3n * 10n ** 18n);
    expect(result.totalMatched).toBe(6n * 10n ** 18n);
    expect(result.returned).toBe(0n);
  });

  it("formats rounds error strings accurately", () => {
    expect(formatRoundsError(new Error("BadGift()"))).toBe(
      "Gifts are between 0.001 and 1,000,000 BOT."
    );
    expect(formatRoundsError(new Error("SelfGive()"))).toBe(
      "The organiser and a project's payee can't give to that project."
    );
    expect(formatRoundsError(new Error("StillOpen(12345)"))).toBe(
      "This round is still open. Finalization can only happen after the round ends."
    );
    expect(formatRoundsError(new Error("AlreadyFinalized()"))).toBe(
      "This round has already been finalized."
    );
  });

  it("calculates bubble radius within bounds", () => {
    const rMin = bubbleRadius(0n, 100n, 30, 90);
    expect(rMin).toBe(30);

    const rMax = bubbleRadius(100n, 100n, 30, 90);
    expect(rMax).toBe(90);

    const rMid = bubbleRadius(25n, 100n, 30, 90);
    // sqrt(0.25) = 0.5 -> 30 + 0.5 * 60 = 60
    expect(rMid).toBe(60);
  });
});
