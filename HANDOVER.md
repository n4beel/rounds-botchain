# Handover: 64 — Rounds

## 1. Summary of Delivery
- **Contract (`Rounds.sol`)**:
  - Implements quadratic funding mechanism with incremental Babylonian `isqrt(x)` for repeat donors per spec §2.
  - Implements pull payments (`pending` mappings and `withdraw()`).
  - Passes 20 forge tests (19 unit/fuzz + 1 invariant test with 256 runs, 128,000 handler calls, 0 reverts).
  - Passes mutation testing: 18 of 25 mutants killed (remaining 7 survivors are mathematically equivalent arithmetic or zero-allocation branches, documented in `contracts/DECISIONS.md`).
- **Library & Pure Model (`lib/rounds.ts`, `lib/errors.ts`)**:
  - `allocate(pool, projects)` implements exact on-chain match allocation and proportional scaling.
  - `bubbleRadius()` computes visual bubble dimensions proportional to square root of ideal funding.
  - `formatRoundsError()` formats all errors into plain English per spec §4.
- **Frontend & Visual Architecture (`app/`, `components/`)**:
  - Archetype **AQ · Bubble field** with Bitter, Outfit, and Geist Mono fonts.
  - Interactive SVG bubble field where bubble sizes reflect total projected funding (with inner dashed rings indicating direct gifts).
  - Accessible table toggle showing projects, raised amounts, match preview, and actions.
  - All routes functional: `/` (home with tiled mini bubble fields), `/new` (round creation), `/round/[id]` (interactive bubble field, gift form, finalize button), and `/me` (donor contributions and pull withdrawal).
- **Verification Scripts**:
  - `check-distinct.py`: Pass (0 problems).
  - `check-tokens.py`: Pass (0 undefined tokens).
  - `check-ui-contract.py`: Pass (`rounds: ok`).
  - `check-honesty.py`: Pass.
- **Build**: Next.js production build passes cleanly.
