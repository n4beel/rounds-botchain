// lib/rounds.ts - Pure reference model, math, and bubble calculations for Rounds (Spec §2, §4)

export function isqrt(x: bigint): bigint {
  if (x === 0n) return 0n;
  let z = (x + 1n) / 2n;
  let y = x;
  while (z < y) {
    y = z;
    z = (x / z + z) / 2n;
  }
  return y;
}

export function idealMatch(sqrtSum: bigint, raised: bigint): bigint {
  const s2 = sqrtSum * sqrtSum;
  if (s2 > raised) {
    return s2 - raised;
  }
  return 0n;
}

export interface ProjectModel {
  payee: string;
  raised: bigint;
  sqrtSum: bigint;
  name: string;
}

export interface AllocateResult {
  matches: bigint[];
  totalMatched: bigint;
  returned: bigint;
}

/**
 * allocate(pool, projects) mirrors `finalize` and `preview` exactly.
 * Uses BigInt integer floor division.
 */
export function allocate(pool: bigint, projects: { raised: bigint; sqrtSum: bigint }[]): AllocateResult {
  const count = projects.length;
  const ideals: bigint[] = new Array(count).fill(0n);
  let sumIdeal = 0n;

  for (let i = 0; i < count; i++) {
    const ideal = idealMatch(projects[i].sqrtSum, projects[i].raised);
    ideals[i] = ideal;
    sumIdeal += ideal;
  }

  const matches: bigint[] = new Array(count).fill(0n);
  let totalMatched = 0n;

  for (let i = 0; i < count; i++) {
    const ideal = ideals[i];
    let matched = 0n;

    if (ideal > 0n && sumIdeal > 0n) {
      if (sumIdeal <= pool) {
        matched = ideal;
      } else {
        matched = (pool * ideal) / sumIdeal;
      }
    }

    matches[i] = matched;
    totalMatched += matched;
  }

  const returned = pool > totalMatched ? pool - totalMatched : 0n;
  return {
    matches,
    totalMatched,
    returned,
  };
}

/**
 * Computes bubble radius for SVG Bubble field.
 * Area is proportional to current ideal funding (sqrtSum² or raised + matched).
 */
export function bubbleRadius(
  idealFunding: bigint,
  maxIdealFunding: bigint,
  minRadius: number = 36,
  maxRadius: number = 96
): number {
  if (maxIdealFunding === 0n || idealFunding === 0n) {
    return minRadius;
  }
  // Area proportional -> radius is proportional to sqrt(idealFunding)
  const ratio = Math.sqrt(Number(idealFunding) / Number(maxIdealFunding));
  return minRadius + ratio * (maxRadius - minRadius);
}

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
