# Rounds

> Small gifts count more than big ones. Quadratic funding round for named public goods projects.

## Archetype
- **AQ · Bubble field**
- Ground `#86B83A` · Surface `#F6FAEC` · Ink `#0E1A02` · Accent `#D81B60`
- Typography: Bitter (headings), Outfit (UI text), Geist Mono (amounts and addresses)

## WCAG Contrast Measurements
- Ink (`#0E1A02`) on Ground (`#86B83A`): **7.7:1** (AAA)
- Ink (`#0E1A02`) on Surface (`#F6FAEC`): **17.0:1** (AAA)
- Muted (`#2D4311`) on Surface (`#F6FAEC`): **10.3:1** (AAA)
- Accent Ink (`#FFFFFF`) on Accent (`#D81B60`): **4.9:1** (AA)
- Menu Text (`#0E1A02`) on Menu BG (`#FFFFFF`): **18.0:1** (AAA)
- Menu Muted (`#6E7667`) on Menu BG (`#FFFFFF`): **4.7:1** (AA)

## What it is
A quadratic funding round for up to 8 named projects. An organiser opens a round with a match pool, an end date, and the list of projects (a name and a payee address each). Anyone can give to a project. When the round ends, anyone can `finalize` it: each project's match is worked out from *how many people gave, not only how much*, and credited, together with the gifts, to its payee via pull withdrawals. Money left over returns to the organiser.

## Verification
- Unit & Invariant tests: 20 forge tests passing (including 1 invariant test with 256 runs, 128,000 handler calls, 0 reverts).
- Mutation check: 18 of 25 mutants killed (7 equivalent survivors documented in `DECISIONS.md`).
- Integration tests: Anvil port 8664, comparing against pure reference model `allocate(pool, projects)`.
- Local stack: `node scripts/local-stack.mjs` (port 8764).
