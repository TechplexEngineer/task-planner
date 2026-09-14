# Task Graph App — Design Spec

Date: 2026-09-14

## Purpose

A local, single-user project-planning web app with three synchronized views over
the same task graph:

1. **Graph view** — a novel dependency-graph visualization: tasks as square
   blocks, arrows from predecessor to successor, auto-arranged so parallelizable
   work is visually obvious.
2. **Gantt view** — auto-scheduled calendar timeline derived from task durations
   and dependencies, supporting milestones with required predecessor tasks.
3. **List view** — a manually-prioritized, dependency-validated task list.

The unifying goal: surface the dependency graph's **critical path** and
**parallelism** across all three views, so the user can decide for themselves
how to slice work into shippable increments — the tool informs, it doesn't
prescribe a slicing scheme.

## Scope

- Single user, no auth, no real-time collaboration.
- Runs locally via `wrangler dev` against a local Cloudflare D1 (SQLite)
  database; architecture is deployable to Cloudflare Workers/Pages later via
  `wrangler deploy` with no code changes, though deployment is not a goal now.
- Multiple projects, each with its own independent task graph, stored in the
  same D1 database.

## Non-goals (v1)

- No auth or multi-user support.
- No milestone-based "value slicing" scoring/prescription — only critical-path
  and parallelism surfacing (columns in the graph view, highlighted critical
  path in graph/Gantt/list).
- No calendar-aware scheduling (weekends/holidays) — CPM counts plain calendar
  days from the project start date.
- No manual date-dragging in the Gantt view — dates are fully derived from CPM.

## Data model

Single Cloudflare D1 database, accessed only from SvelteKit server code
(`+server.ts`, server `load`, form actions) via `platform.env.DB` and
`drizzle-orm/d1`.

**`projects`**

- `id`, `name`, `start_date` (CPM anchor date), `created_at`

**`tasks`**

- `id`, `project_id`, `title`, `description`, `type` (`task` | `milestone`),
  `duration_days` (milestones always `0`), `status`
  (`todo` | `in_progress` | `done`), `priority_rank` (integer, drives manual
  list order), `created_at`

**`dependencies`**

- `id`, `project_id`, `predecessor_id`, `successor_id`

This is the single source of truth for graph arrows, Gantt dependency lines,
and list-order validation. A milestone's "required tasks" are simply its
predecessors in this table. Every edge write runs cycle detection first and is
rejected (with an inline error) if it would create a cycle.

**`task_positions`** (graph view manual override)

- `task_id`, `offset_x`, `offset_y` — an offset from the computed auto-layout
  position, so manual nudges survive re-layout unless the task's structural
  layer changes enough to invalidate the offset.

### Derived (computed server-side per load, not stored)

- `earliest_start` / `earliest_finish` — CPM forward pass from
  `project.start_date`.
- `latest_start` / `latest_finish` — CPM backward pass.
- `slack` = `latest_start - earliest_start`.
- `on_critical_path` = `slack == 0`.
- `layer` = longest-path-from-root depth — drives the graph view's auto-layout
  columns.

CPM scheduling, cycle detection, and layer assignment live in plain,
D1-agnostic TypeScript modules (pure functions over an in-memory task/edge
list), independently unit-testable and shared by all three views so
computation happens once per load, not per view.

## Graph view

- **Layout**: nodes auto-arranged into columns by `layer`. Tasks in the same
  column have no dependency ordering between them and can run in parallel —
  the column _is_ the parallelism signal. Within a column, order by
  `priority_rank` as a simple, sufficient crossing-reduction heuristic.
- **Manual override**: dragging a node writes an `(offset_x, offset_y)` to
  `task_positions`. Re-layout (triggered on structural change — task/edge
  added/removed) recomputes base positions but preserves each task's offset;
  if a task's layer changes enough to make the offset misleading (e.g. it
  jumps to a distant column), its offset resets.
- **Rendering**: custom SVG. Square blocks styled by `status`; a distinct
  highlight for `on_critical_path`, shared visual language with Gantt/list.
- **Interactions**: drag from one node's edge to another to create a
  dependency (rejected inline if it would cycle); click to open an edit panel
  (title/description/duration/status); delete to remove a task or edge.

## Gantt view

- **Scheduling**: fully derived from CPM. Bars span `earliest_start` →
  `earliest_finish`, offset in calendar days from `project.start_date`.
- **Rendering**: a small existing Gantt/timeline component (specific package
  chosen during implementation, vetted for Svelte 5 compatibility), fed
  pre-computed dates/dependencies/critical-path flags rather than managing its
  own scheduling state.
- **Milestones**: zero-duration diamond markers at `earliest_start`, always
  positioned after all required predecessor tasks per CPM.
- **Critical path**: bars on the critical path get the same highlight
  treatment as the graph view.
- **Editing**: changing `duration_days` (here or elsewhere) re-runs CPM and
  cascades downstream bar positions immediately.

## List view

- Sortable list ordered by `priority_rank`; drag-reorder via a small
  drag-and-drop library, re-sequencing `priority_rank` on drop.
- **Dependency validation**: if a task is dragged above one of its own
  predecessors, show a non-blocking inline warning badge on both tasks.
- Each row shows title, status, duration, and a critical-path indicator
  (same visual language as the other views).
- Milestones appear in the list (zero duration, distinct icon) since they
  still occupy a position in delivery order.

## Cross-view consistency & navigation

- Three views are tabs/routes under a project: `/project/[id]/graph`,
  `/project/[id]/gantt`, `/project/[id]/list`. All read from the same
  project's tasks/dependencies; CPM/layer computation happens once
  server-side per load and is shared across views.
- Edits in any view (status change, duration change, new/removed dependency)
  invalidate so other views reflect the change on next visit/refetch.
- A project switcher (list, create, rename, delete) sits above the three
  tabs.

## Tech stack & structure

- SvelteKit + TypeScript (already scaffolded).
- `@sveltejs/adapter-cloudflare`; DB access via Cloudflare D1
  (`platform.env.DB`) and `drizzle-orm/d1`.
- Local dev via `wrangler dev` (Miniflare emulates D1 as a local SQLite file
  under `.wrangler/state`); `wrangler.jsonc` declares the D1 binding and local
  database. `npm run dev` updated to invoke the Wrangler-backed dev flow so
  `platform.env` is populated in `+server.ts`/`load`/actions.
- Schema/migrations: Drizzle schema in TS; migrations generated by Drizzle,
  applied via `wrangler d1 migrations apply` (against the local emulated DB
  now; same command works against a real D1 database if deployed later).
- CPM scheduling, cycle detection, and layer assignment: plain TypeScript
  modules under `src/lib/server/scheduling/` (or similar), D1-agnostic and
  independently unit-testable.
- Deployable later via `wrangler deploy` with no architecture change.

## Testing

- Unit tests (vitest, already scaffolded) for CPM scheduling, cycle
  detection, and layer assignment — pure functions, highest-value correctness
  surface.
- Playwright e2e (already scaffolded) for core flows: create tasks, add a
  dependency, see it reflected across graph/Gantt/list, drag-reorder
  validation warning, milestone scheduling after its required predecessors.

## Open items for implementation time

- Exact Gantt timeline component and list drag-and-drop library — chosen and
  vetted for Svelte 5 compatibility during implementation.
- Exact crossing-reduction heuristic within a graph-view column, if
  `priority_rank` ordering proves visually insufficient in practice.
