# Git & Remote Strategy

## Why Two Remotes

AxonFlux uses a **two-remote** git setup: one private (local or private GitHub) and one public. Same codebase, same history — just two push destinations.

The `.gitignore` is the safety layer. Real data (`data/`, `exports/`), credentials (`.env`), and the Er4u automation script are all excluded. Pushing to the public remote is safe by construction.

## One-Time Setup

```bash
# Add the public GitHub remote
git remote add public git@github.com:YOUR_USERNAME/axonflux.git

# Convenience alias — push to both with one command
git config alias.pushall '!git push origin main && git push public main'
```

Verify:
```bash
git remote -v
# origin   git@github.com:you/axonflux-private.git
# public   git@github.com:you/axonflux.git
```

## Daily Workflow

You do **not** push to the public remote on every commit.

1. Work and commit normally (`git commit`)
2. Push to private for backup (`git push origin main`)
3. When a feature is complete and portfolio-ready: `git pushall`

The alias runs both pushes sequentially — if the private push fails, it won't push public either.

## What's Safe to Push

| Path | Safe? | Reason |
|---|---|---|
| All source code | ✅ | Generic plumbing, no business logic |
| `docs/` | ✅ | Architecture docs, no real data |
| `web/` (frontend) | ✅ | No credentials embedded |
| `data/sample/` | ✅ | Synthetic data only |
| `.env.example` | ✅ | Placeholder values only |
| `sql/` | ✅ | Generic analytics SQL |
| `.env` | ❌ | Real DB credentials — gitignored |
| `data/incoming/`, `data/processed/` | ❌ | Real exports — gitignored |
| `exports/` | ❌ | Real Excel output — gitignored |
| `scripts/er4u_export.py` | ❌ | UI automation script — gitignored |
| `.claude/` | ❌ | Claude Code working dir — gitignored |

All ❌ items are covered by `.gitignore` — they cannot accidentally be committed.
