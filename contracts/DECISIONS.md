# Architecture & Design Decisions: Rounds

## 1. Incremental Square Root for Repeat Donors
- **Decision**: When donor gives repeatedly, we update:
  `proj.sqrtSum = proj.sqrtSum + isqrt(newGiven) - isqrt(oldGiven);`
- **Rationale**: `s = Σ √(donor total)` must be evaluated over the total amount each distinct donor contributed to that project, rather than the square root of each individual gift. Maintaining the sum incrementally via `isqrt(new) - isqrt(old)` avoids storing an unbounded dynamic array of donor addresses per project, reducing gas to `O(1)` per gift while staying mathematically exact.

## 2. Proportional Scaling & Rounding
- **Decision**: If `sumIdeal <= pool`, `match = ideal`; otherwise `match = (pool * ideal) / sumIdeal`.
- **Rationale**: Guarantees `Σ match <= pool` strictly. The remainder `pool - Σ match` is returned to the round organiser upon finalization.

## 3. Pull Payment Architecture
- **Decision**: Finalization credits `pending[payee]` and `pending[organiser]` rather than pushing ETH via direct calls. Beneficiaries withdraw with `withdraw()`.
- **Rationale**: Prevents malicious or unpayable contracts from reverting the whole round finalization for all other projects.

## 4. Mutation Testing & Equivalent Mutants
- Mutation testing killed 18 of 25 selected mutants (72% kill rate).
- Surviving mutants are equivalent or defensive boundary guards:
  - `Rounds.sol:273` (`pool > totalMatched ? pool - totalMatched : 0` vs `>=`): When `pool == totalMatched`, `pool - totalMatched` evaluates to 0 anyway, so ternary outcome is identical.
  - `Rounds.sol:274` (`if (returned > 0)` vs `>= 0`): Adding 0 to `pending` is a no-op that produces no observable state divergence.
  - `Rounds.sol:345` (`if (ideal > 0 && sumIdeal > 0)` vs `>= 0` or `||`): When `ideal == 0`, `matched` evaluates to `0` anyway, so `matches[i]` is identical.
  - `Rounds.sol:346` (`if (sumIdeal <= pool)` vs `<`): When `sumIdeal == pool`, `(pool * ideal) / sumIdeal == (pool * ideal) / pool == ideal`, producing identical arithmetic result.
  - `Rounds.sol:281` (`withdraw() external nonReentrant` vs no modifier): State is zeroed before the external call (`pending[msg.sender] = 0;`), providing reentrancy safety even without the modifier; the modifier provides defense-in-depth against malicious reentrant execution.
