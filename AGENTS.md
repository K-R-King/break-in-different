# Rules for coding agents (Claude Code, Codex, Cursor, Opencode)

Read README.md for setup and architecture. The Agent Brief and Build Plan are the requirements; the Google Stitch / design canvas screens are the UI source of truth.

## Team ownership

| Area | Owner | Directories |
|---|---|---|
| Frontend + accessibility | Karthik | `src/`, `public/` |
| Backend + data | Chris | `convex/` (not `ai/`, `match/`), `convex/schema.ts`, `shared/` schema, `docker-compose.yml`, `docker/`, `scripts/` |
| AI + agents | Mark | `convex/ai/`, `convex/match/`, `agent/` |
| Pitch, QA, demo | Roman | `docs/`, `tests/` (with Mark for labelling and screen-reader passes) |

Teammates may help in another area only after asking its owner.

## Rules

1. **Inspect first.** Read `git status`, `git log -5`, the target file and the contract it touches (`shared/types.ts`, `shared/taxonomy.ts`, `convex/schema.ts`); reuse existing helpers.
2. **Stay in your lane.** Edit only the task owner's directories; never reformat, rename or move unrelated files. `convex/schema.ts`, `shared/*`, dependencies and `docker-compose.yml` change only via their owner.
3. **Never overwrite teammates' work.** No `git reset --hard`, `git checkout .`, or force pushes. Unexpected changes in the tree: stop and ask.
4. **Handle ambiguity openly.** Unclear: write it in `docs/open-questions.md`, take the safest reading, mark `// PROVISIONAL`, and say so. Never invent API fields or vendor behavior; confirm vendor details against current docs.
5. **No new dependencies or secrets** without owner approval; never print, commit or log a key.
6. **Verify before reporting done.** Run `npm run typecheck`, `npm run lint`, `npm test`, and the relevant `npm run e2e` / `npm run test:a11y`; report exact commands and results, including failures.
7. **Conventions.** TypeScript strict; Conventional Commits; branches `feat/<area>-<topic>`; squash merge after one owner review with CI green; user-facing strings in `src/copy.ts`; ESLint with `jsx-a11y`, Prettier, Ruff.
8. **Contract changes** (function args, JSON shapes, taxonomy) are their own PR, announced to the team, and update the brief.

## Invariants that must never break

- No disability data in match requests, agent payloads, Claude prompts or logs (`convex/ai/privacy.test.ts`, `tests/integration/security.mjs`).
- Every "Stated" label carries a verbatim quote from the listing (`convex/ai/validators.ts`).
- No interface text says an employer does not or cannot provide an accommodation (`src/copy.test.ts`).
- Every function except `/health` checks the signed-in user owns the record.
- Nothing is copied or opened until the user approves the draft.
- Every sponsor integration keeps a working fallback.
