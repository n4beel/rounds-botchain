// lib/limits.ts - Constants mirrored from contracts/src/Rounds.sol

export const MAX_PROJECTS = 8;
export const MAX_NAME_BYTES = 48;
export const MAX_PROJECT_NAME = 40;
export const MIN_GIFT = 1000000000000000n; // 1e15 (0.001 BOT)
export const MAX_GIFT = 1000000000000000000000000n; // 1e24
export const MAX_POOL = 1000000000000000000000000000n; // 1e27
export const MAX_RAISED = 1000000000000000000000000000n; // 1e27
export const MIN_DURATION = 3600; // 1 hours in seconds
export const MAX_DURATION = 7776000; // 90 days in seconds (90 * 86400)
export const MAX_PAGE = 50;
