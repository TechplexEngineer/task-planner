# Tree View — Design Spec

Date: 2026-09-16

## Purpose

An Azure DevOps-style hierarchical task tree, added as a fourth view alongside
Graph/Gantt/List, optimized for rapidly entering and organizing large numbers
of tasks via keyboard: `Enter` for a new row, `Tab`/`Shift+Tab` to
indent/outdent.

## Relationship to the existing data model

The app's existing `dependencies` table (predecessor/successor) drives CPM,
critical path, and cycle-checked scheduling — that's a DAG, not a hierarchy,
and is unaffected by this feature. This feature introduces a **separate**,
purely organizational parent/child relationship (a real tree), with no
scheduling implication, matching how Azure DevOps separates work-item
hierarchy from "blocked by" links.

## Data model changes

`tasks` gains two nullable-safe columns:

- `parent_id` (integer, nullable, self-referencing FK to `tasks.id`) — the
  task's parent in the tree; `null` means a root node.
- `tree_rank` (integer, not null) — order among siblings sharing the same
  `parent_id` (including `null`). Deliberately separate from the existing
  `priority_rank` (which drives the flat List view's manual order) — the two
  orderings are independent and never collide.

Migration generated via Drizzle (`drizzle-kit generate`), applied the same
way as the existing migration.

`deleteTask` (in `src/lib/server/repositories/tasks.ts`, already shared by
List/Graph) is extended to recursively delete descendants first, so deleting
a task from *any* view can never leave orphaned children with a dangling
`parent_id`.

## New repository functions (`tasks.ts`)

- `createChildTask(db, { projectId, parentId, afterTaskId })` — creates a task
  with an empty title, `type: 'task'`, default duration/status (same
  defaults as `createTask`), placed as a child of `parentId` (or root if
  `null`) immediately after `afterTaskId` among its siblings, renumbering
  sibling `tree_rank`s as needed.
- `indentTask(db, id)` — recomputes `parent_id`/`tree_rank` to make `id` the
  last child of its previous sibling. No-op (returns unchanged) if there is
  no previous sibling.
- `outdentTask(db, id)` — recomputes `parent_id`/`tree_rank` to make `id` a
  sibling immediately after its current parent. No-op if already root.
- Both indent/outdent only ever re-parent onto a node adjacent in the
  existing tree, so no cycle-detection is required (unlike
  `dependencies.createDependency`, which guards a general DAG).

## New route: `/project/[id]/tree`

- **Nav**: a "Tree" tab added to `src/lib/components/Navbar.svelte`, alongside
  List/Graph/Gantt.
- **`+page.server.ts`**: loads all tasks for the project (same query as
  List's load), passed to the page as a flat list with `parentId`/`treeRank`.
- **`+server.ts`**: a dedicated endpoint, following the same
  no-full-reload pattern already established for the Graph view's continuous
  edits (`src/routes/project/[id]/graph/+server.ts`) — necessary here because
  reloading the page per keystroke/row would defeat the "add lots of tasks
  fast" goal:
  - `POST` — create a new task (`createChildTask`); returns the created task.
  - `PATCH` — either a title edit (debounced while typing, flushed on blur)
    or a reparent (indent/outdent); returns the updated task.
  - `DELETE` — delete a task (only ever called on an empty, childless row from
    the Backspace shortcut); returns `{ ok: true }`.
- **`+page.svelte`**: renders `<TaskTree>`, wires its callbacks to the
  `+server.ts` endpoint via `fetch`, merging responses into local state.

## New component: `TaskTree.svelte`

Renders the nested rows. Each row: a chevron (if it has children) to
collapse/expand — client-side only, not persisted — plus a type icon (reused
from List's `◆`/`▢` convention) and an editable title `<input>`, indented by
`depth * 20px` or similar.

### Keyboard behavior (scoped to the focused row's title input)

- **Enter**: always creates a new empty sibling row immediately after the
  current one (same depth), regardless of cursor position — current text is
  never split. Persists immediately via `POST`; focuses the new row.
- **Tab**: indent. No-op if there's no previous sibling to become the parent.
- **Shift+Tab**: outdent. No-op at root.
- **Backspace** when the title is empty and cursor is at position 0: deletes
  the row (only if childless) via `DELETE`, then focuses the end of the
  previous visible row's title. No-op (does nothing) if the row has children.
- **ArrowUp / ArrowDown**: move focus to the previous/next *visible* row's
  title (respecting collapsed subtrees), no persistence involved.

Indent/outdent and children always travel together, since nesting is defined
by `parent_id`, not screen position — a row's descendants stay attached
wherever it moves.

## New pure module: `src/lib/tree-data.ts`

D1-agnostic, independently unit-tested (matching the existing
`gantt-data.ts`/`graph-layout.ts` pattern):

- Build a nested structure from the flat `{ id, parentId, treeRank }[]` list.
- Flatten to visible rows given a client-side collapsed-node set (skipping
  descendants of collapsed nodes), each annotated with `depth` and
  `hasChildren`.
- Compute renumbered `tree_rank` values for insert-after-sibling,
  indent, and outdent operations.

## Scope / non-goals (v1)

- Tree rows edit **title and hierarchy only**. Status/duration/type/
  description remain editable only via the existing List/Graph views — no
  new editing UI is added for them here.
- No drag-and-drop reordering in the tree (keyboard-only for v1).
- No nesting depth limit.
- Collapse/expand state is not persisted across reloads.

## Testing

- `tree-data.test.ts` (vitest): nested-structure building, flatten/collapse
  visibility, sibling `tree_rank` renumbering for insert/indent/outdent.
- Playwright e2e: create several tasks via Enter, indent one with Tab,
  outdent with Shift+Tab, verify nesting in the DOM, collapse/expand hides/
  shows children, Backspace deletes an empty childless row and refocuses the
  previous row, Backspace no-ops on a row with children.
