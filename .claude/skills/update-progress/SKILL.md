---
name: update-progress
description: Use when project work ships or the roadmap moves — e.g. user says "update progress", "we shipped X", "mark phase done", "update academy/explainer/roadmap". Updates every knowledge surface (Academy data modules, Deep Dive explainer, CLAUDE.md roadmap, session docs) consistently so none drift.
---

# AxonFlux Progress Updater

One shipped feature must update several knowledge surfaces. This skill is the
authoritative map + procedure. **Academy data modules are canonical**; everything
else derives from or narrates them.

## The update map

| Surface | Location | Update when |
|---|---|---|
| **Academy topics** | `web/lib/academy/topics-data-backend.ts`, `topics-ml-ai.ts` | A frontier topic's phase ships → flip `status: "planned"` → `"ready"` and WRITE its level2/level3/mentor/exercises from the real implementation. New concept introduced → add a Topic object (id, prereqs, pos on synapse map). |
| **Academy features** | `web/lib/academy/features.ts` | New feature shipped → add a Feature case study (problem, flows, theory links, interview Qs, production notes). Existing feature changed → patch its entry. |
| **Academy roadmap** | `web/lib/academy/roadmap.ts` | Phase item completed → mark it in the phase's features list (prefix "✅ " on the name). Whole phase done → note in `goal`. Rejected-tech list changes only with an explicit decision. |
| **Academy architecture** | `web/lib/academy/architecture.ts` | New system component (Redis, worker, MCP server...) → add ArchNode + edges. |
| **Academy challenges** | `web/lib/academy/challenges.ts` | Shipped code worth rebuilding from memory → add a Challenge (brief, requirements, progressive hints, solution files). |
| **Interview deck** | auto-derived from topics + features + `web/lib/academy/interview.ts` (SYSTEM_QUESTIONS) | Add system-wide questions only for cross-cutting stories (scaling, incidents, big trade-offs). |
| **Deep Dive explainer** | `web/components/docs/explainer/sections/*` (served at `/academy/deep-dive`) | **Patch in place, never regenerate** (user rule). Update `Changelog.tsx` with shipped work; touch other sections only if the narrative they tell changed. Do NOT re-add concept/roadmap/interview content here — Academy owns those. |
| **CLAUDE.md roadmap** | `CLAUDE.md` (project root, "Project Roadmap" section) | Move shipped items to ✅ with a one-line summary, same style as existing entries. |
| **Docs library** | `docs/architecture/*.md`, `docs/decisions/*.md` | New architecture or ADR-worthy decision → markdown file (auto-appears at `/academy/library` via `api/routers/docs.py`). |
| **Session doc** | `docs/session_<topic>.md` | When user says "document": full session write-up goes here (user rule — `.remember/` alone is not documentation). |

Learning progress (confidence marks, revealed questions, done challenges) lives in
**localStorage only** (`web/lib/academy/progress.ts`) — never edit code for it.

## Procedure

1. **Identify what shipped.** Diff or user statement. List affected surfaces from the map — most updates touch 3–5 rows, not all.
2. **Academy first** (canonical). Frontier topic deepening is the highest-value step:
   level2/level3 content must reference the REAL implementation (files, bugs hit,
   numbers measured) — not generic theory. Keep the existing voice: analogy-first,
   problem-before-solution, trade-offs named, "when NOT" honest.
3. **Explainer changelog** entry (patch in place).
4. **CLAUDE.md roadmap** tick.
5. **ADR/architecture doc** if a real decision was made (`docs/decisions/NNN-*.md`).
6. **Verify**: `cd web && npm run build` must pass (type-checks all Academy data).
7. **Commit** per caveman-commit conventions (conventional commits, why over what,
   Co-Authored-By trailer). Separate commit for content updates vs code.
8. **Push** only when user says push; "push all" = both remotes: `git push origin main && git push public main`.

## Invariants

- Topic `id`s are referenced by `prereqs`/`unlocks`/`features.theory`/`challenges.topicId` — renaming an id requires updating all references (build catches none of these; grep for the id).
- Every new topic needs `pos {x,y}` inside its domain's column band (data x≈6–24, backend x≈28–46, ml x≈52–70, ai x≈74–96) — otherwise it lands on top of another node.
- `status: "ready"` requires non-empty level2 AND level3. Don't flip status without writing the content — a dashed node that lies is worse than a dashed node.
- Never store progress/state in Academy data files; they are content, versioned in git.
- Mentorship rule overrides speed: when deepening a topic, explain WHY the implementation is shaped as it is, in the user's learning style (analogy → problem → mechanism → trade-offs).
