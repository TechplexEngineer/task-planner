# Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Graph view — a novel, fluid, WYSIWYG-editable dependency-graph visualization — as the second of the app's three synchronized views, reached via a List/Graph tab under each project.

**Architecture:** A new route `/project/[id]/graph` reuses the parent layout's already-computed `tasks` (with `schedule`, `layer`) and `dependencies`, adds each task's manual `(offsetX, offsetY)` from `task_positions`, and renders a hand-rolled, pannable/zoomable SVG canvas. Structural edits (new task+edge, new edge, deletes) go through SvelteKit form actions and reload view data. Continuous, non-structural edits (drag reposition, inline title edit, status/description/duration edits) hit a small `+server.ts` PATCH endpoint via `fetch` and update local component state directly, with no page reload — this is what makes dragging and typing feel instant. All coordinate/layout/offset-reset math is pure, D1-agnostic TypeScript, independently unit tested.

**Tech Stack:** SvelteKit (Svelte 5 runes), TypeScript, Cloudflare D1 via Drizzle ORM (already in place), hand-rolled SVG pointer-event/wheel handling — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-task-graph-app-design.md` (see "Graph view" section)

## Global Constraints

- Single user, no auth (spec: Scope).
- Every dependency-graph edge write must run cycle detection first and be rejected if it would create a cycle (spec: Data model).
- Milestones (`type: 'milestone'`) always have `duration_days = 0` (spec: Data model) — `updateTask` already enforces this.
- A task's manual position offset resets to `(0, 0)` whenever a structural change (task/edge add or remove) changes that specific task's computed `layer` — a deterministic rule, not a distance heuristic (spec: Graph view).
- Structural changes (new task+edge, new edge, deletes) use form actions and reload data; continuous interactions (drag, inline edit, field edits) use a PATCH endpoint and local state, no reload (spec: Graph view — Persistence model).
- No pan/zoom or drag-and-drop library dependency — hand-rolled pointer events and `viewBox` manipulation (spec: Graph view — Rendering).

---

## Task 1: Task positions repository + layer-change offset-reset rule

**Files:**

- Create: `src/lib/server/repositories/positions.ts`
- Create: `src/lib/server/scheduling/offset-reset.ts`
- Test: `src/lib/server/scheduling/offset-reset.test.ts`

**Interfaces:**

- Consumes: `getDb`, `Db`, `taskPositions` table (already in `src/lib/server/db/schema.ts`).
- Produces: `listPositionsForTasks(db, taskIds): Promise<Map<number, {offsetX: number; offsetY: number}>>`, `upsertPosition(db, taskId, offsetX, offsetY): Promise<void>`, `resetPosition(db, taskId): Promise<void>` from `$lib/server/repositories/positions`; `taskIdsWithChangedLayer(before: Map<number, number>, after: Map<number, number>): number[]` from `$lib/server/scheduling/offset-reset` — all consumed by Task 4 (load), Task 6 (PATCH endpoint), and Task 10 (structural actions).

- [ ] **Step 1: Write the failing offset-reset tests**

Create `src/lib/server/scheduling/offset-reset.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { taskIdsWithChangedLayer } from './offset-reset';

describe('taskIdsWithChangedLayer', () => {
	it('returns an empty list when no layers changed', () => {
		const before = new Map([
			[1, 0],
			[2, 1]
		]);
		const after = new Map([
			[1, 0],
			[2, 1]
		]);
		expect(taskIdsWithChangedLayer(before, after)).toEqual([]);
	});

	it('returns the id of a task whose layer changed', () => {
		const before = new Map([
			[1, 0],
			[2, 1]
		]);
		const after = new Map([
			[1, 0],
			[2, 2]
		]);
		expect(taskIdsWithChangedLayer(before, after)).toEqual([2]);
	});

	it('ignores a brand-new task with no "before" layer', () => {
		const before = new Map([[1, 0]]);
		const after = new Map([
			[1, 0],
			[2, 0]
		]);
		expect(taskIdsWithChangedLayer(before, after)).toEqual([]);
	});

	it('ignores a task that no longer exists after the change', () => {
		const before = new Map([
			[1, 0],
			[2, 1]
		]);
		const after = new Map([[1, 0]]);
		expect(taskIdsWithChangedLayer(before, after)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/scheduling/offset-reset.test.ts`
Expected: FAIL with "Cannot find module './offset-reset'".

- [ ] **Step 3: Implement the offset-reset rule**

Create `src/lib/server/scheduling/offset-reset.ts`:

```ts
export function taskIdsWithChangedLayer(
	before: Map<number, number>,
	after: Map<number, number>
): number[] {
	const changed: number[] = [];
	for (const [id, afterLayer] of after) {
		const beforeLayer = before.get(id);
		if (beforeLayer !== undefined && beforeLayer !== afterLayer) {
			changed.push(id);
		}
	}
	return changed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/scheduling/offset-reset.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Write the positions repository**

Create `src/lib/server/repositories/positions.ts`:

```ts
import { eq, inArray } from 'drizzle-orm';
import { taskPositions } from '../db/schema';
import type { Db } from '../db/client';

export interface TaskOffset {
	offsetX: number;
	offsetY: number;
}

export async function listPositionsForTasks(
	db: Db,
	taskIds: number[]
): Promise<Map<number, TaskOffset>> {
	const offsets = new Map<number, TaskOffset>();
	if (taskIds.length === 0) return offsets;
	const rows = await db
		.select()
		.from(taskPositions)
		.where(inArray(taskPositions.taskId, taskIds))
		.all();
	for (const row of rows) {
		offsets.set(row.taskId, { offsetX: row.offsetX, offsetY: row.offsetY });
	}
	return offsets;
}

export async function upsertPosition(
	db: Db,
	taskId: number,
	offsetX: number,
	offsetY: number
): Promise<void> {
	await db
		.insert(taskPositions)
		.values({ taskId, offsetX, offsetY })
		.onConflictDoUpdate({ target: taskPositions.taskId, set: { offsetX, offsetY } });
}

export async function resetPosition(db: Db, taskId: number): Promise<void> {
	await db.delete(taskPositions).where(eq(taskPositions.taskId, taskId));
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/repositories/positions.ts src/lib/server/scheduling/offset-reset.ts src/lib/server/scheduling/offset-reset.test.ts
git commit -m "feat: add task positions repository and layer-change offset-reset rule"
```

---

## Task 2: Pure graph layout math (base positions from layer)

**Files:**

- Create: `src/lib/graph-layout.ts`
- Test: `src/lib/graph-layout.test.ts`

**Interfaces:**

- Produces: `GRAPH_COLUMN_WIDTH`, `GRAPH_ROW_HEIGHT`, `NODE_SIZE` constants; `Point { x: number; y: number }`; `LayeredTask { id: number; layer: number; priorityRank: number }`; `computeBasePositions(tasks: LayeredTask[]): Map<number, Point>` from `$lib/graph-layout` — consumed by Task 4 (load) and Task 3 (`Point` type reuse).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/graph-layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeBasePositions, GRAPH_COLUMN_WIDTH, GRAPH_ROW_HEIGHT } from './graph-layout';

describe('computeBasePositions', () => {
	it('places a single task at the origin', () => {
		const positions = computeBasePositions([{ id: 1, layer: 0, priorityRank: 1 }]);
		expect(positions.get(1)).toEqual({ x: 0, y: 0 });
	});

	it('places tasks in later layers further right, by column width', () => {
		const positions = computeBasePositions([
			{ id: 1, layer: 0, priorityRank: 1 },
			{ id: 2, layer: 1, priorityRank: 1 }
		]);
		expect(positions.get(1)!.x).toBe(0);
		expect(positions.get(2)!.x).toBe(GRAPH_COLUMN_WIDTH);
	});

	it('stacks tasks in the same layer vertically, ordered by priorityRank', () => {
		const positions = computeBasePositions([
			{ id: 1, layer: 0, priorityRank: 2 },
			{ id: 2, layer: 0, priorityRank: 1 }
		]);
		expect(positions.get(2)!.y).toBe(0);
		expect(positions.get(1)!.y).toBe(GRAPH_ROW_HEIGHT);
	});

	it('returns an empty map for no tasks', () => {
		expect(computeBasePositions([]).size).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/graph-layout.test.ts`
Expected: FAIL with "Cannot find module './graph-layout'".

- [ ] **Step 3: Implement**

Create `src/lib/graph-layout.ts`:

```ts
export const GRAPH_COLUMN_WIDTH = 220;
export const GRAPH_ROW_HEIGHT = 120;
export const NODE_SIZE = 96;

export interface Point {
	x: number;
	y: number;
}

export interface LayeredTask {
	id: number;
	layer: number;
	priorityRank: number;
}

export function computeBasePositions(tasks: LayeredTask[]): Map<number, Point> {
	const byLayer = new Map<number, LayeredTask[]>();
	for (const task of tasks) {
		const list = byLayer.get(task.layer) ?? [];
		list.push(task);
		byLayer.set(task.layer, list);
	}

	const positions = new Map<number, Point>();
	for (const [layer, tasksInLayer] of byLayer) {
		const ordered = [...tasksInLayer].sort((a, b) => a.priorityRank - b.priorityRank);
		ordered.forEach((task, index) => {
			positions.set(task.id, { x: layer * GRAPH_COLUMN_WIDTH, y: index * GRAPH_ROW_HEIGHT });
		});
	}
	return positions;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/graph-layout.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph-layout.ts src/lib/graph-layout.test.ts
git commit -m "feat: add pure graph-view base-layout math"
```

---

## Task 3: Pure viewport math (pan, zoom-at-cursor, coordinate projection)

**Files:**

- Create: `src/lib/graph-viewport.ts`
- Test: `src/lib/graph-viewport.test.ts`

**Interfaces:**

- Consumes: `Point` (Task 2).
- Produces: `Viewport { x: number; y: number; scale: number }`, `Rect { left: number; top: number }`, `DEFAULT_VIEWPORT`, `MIN_SCALE`, `MAX_SCALE`, `screenToSvg(point: Point, rect: Rect, viewport: Viewport): Point`, `svgToScreen(point: Point, rect: Rect, viewport: Viewport): Point`, `panViewport(viewport: Viewport, deltaScreenX: number, deltaScreenY: number): Viewport`, `zoomViewportAtPoint(viewport: Viewport, cursorScreen: Point, rect: Rect, zoomFactor: number): Viewport` from `$lib/graph-viewport` — consumed by Task 5 (pan/zoom UI) and Task 12 (popover positioning).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/graph-viewport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_VIEWPORT,
	MAX_SCALE,
	MIN_SCALE,
	panViewport,
	screenToSvg,
	svgToScreen,
	zoomViewportAtPoint
} from './graph-viewport';

const rect = { left: 100, top: 50 };

describe('screenToSvg / svgToScreen', () => {
	it('round-trips a point at the default viewport', () => {
		const screenPoint = { x: 150, y: 90 };
		const svgPoint = screenToSvg(screenPoint, rect, DEFAULT_VIEWPORT);
		expect(svgToScreen(svgPoint, rect, DEFAULT_VIEWPORT)).toEqual(screenPoint);
	});

	it('accounts for pan offset and scale', () => {
		const viewport = { x: 20, y: 10, scale: 2 };
		const svgPoint = screenToSvg({ x: 120, y: 70 }, rect, viewport);
		expect(svgPoint).toEqual({ x: 30, y: 20 });
	});
});

describe('panViewport', () => {
	it('shifts the viewport opposite the drag delta, scaled', () => {
		const viewport = { x: 0, y: 0, scale: 2 };
		expect(panViewport(viewport, 20, 10)).toEqual({ x: -10, y: -5, scale: 2 });
	});
});

describe('zoomViewportAtPoint', () => {
	it('keeps the cursor over the same SVG point after zooming in', () => {
		const viewport = { x: 0, y: 0, scale: 1 };
		const cursorScreen = { x: 150, y: 90 };
		const before = screenToSvg(cursorScreen, rect, viewport);
		const after = zoomViewportAtPoint(viewport, cursorScreen, rect, 2);
		const svgPointAfter = screenToSvg(cursorScreen, rect, after);
		expect(svgPointAfter.x).toBeCloseTo(before.x);
		expect(svgPointAfter.y).toBeCloseTo(before.y);
	});

	it('clamps scale to MIN_SCALE/MAX_SCALE', () => {
		const tinyZoom = zoomViewportAtPoint(
			{ x: 0, y: 0, scale: MIN_SCALE },
			{ x: 0, y: 0 },
			rect,
			0.1
		);
		expect(tinyZoom.scale).toBe(MIN_SCALE);
		const hugeZoom = zoomViewportAtPoint(
			{ x: 0, y: 0, scale: MAX_SCALE },
			{ x: 0, y: 0 },
			rect,
			10
		);
		expect(hugeZoom.scale).toBe(MAX_SCALE);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/graph-viewport.test.ts`
Expected: FAIL with "Cannot find module './graph-viewport'".

- [ ] **Step 3: Implement**

Create `src/lib/graph-viewport.ts`:

```ts
import type { Point } from './graph-layout';

export interface Viewport {
	x: number;
	y: number;
	scale: number;
}

export interface Rect {
	left: number;
	top: number;
}

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 3;
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 };

export function screenToSvg(point: Point, rect: Rect, viewport: Viewport): Point {
	return {
		x: viewport.x + (point.x - rect.left) / viewport.scale,
		y: viewport.y + (point.y - rect.top) / viewport.scale
	};
}

export function svgToScreen(point: Point, rect: Rect, viewport: Viewport): Point {
	return {
		x: rect.left + (point.x - viewport.x) * viewport.scale,
		y: rect.top + (point.y - viewport.y) * viewport.scale
	};
}

export function panViewport(
	viewport: Viewport,
	deltaScreenX: number,
	deltaScreenY: number
): Viewport {
	return {
		...viewport,
		x: viewport.x - deltaScreenX / viewport.scale,
		y: viewport.y - deltaScreenY / viewport.scale
	};
}

export function zoomViewportAtPoint(
	viewport: Viewport,
	cursorScreen: Point,
	rect: Rect,
	zoomFactor: number
): Viewport {
	const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, viewport.scale * zoomFactor));
	const svgPointUnderCursor = screenToSvg(cursorScreen, rect, viewport);
	return {
		scale: newScale,
		x: svgPointUnderCursor.x - (cursorScreen.x - rect.left) / newScale,
		y: svgPointUnderCursor.y - (cursorScreen.y - rect.top) / newScale
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/graph-viewport.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/graph-viewport.ts src/lib/graph-viewport.test.ts
git commit -m "feat: add pure pan/zoom viewport math for the graph view"
```

---

## Task 4: Graph route scaffold — load, tab nav, static rendering

**Files:**

- Create: `src/routes/project/[id]/graph/+page.server.ts`
- Create: `src/routes/project/[id]/graph/+page.svelte`
- Create: `src/routes/project/[id]/graph/GraphNode.svelte`
- Modify: `src/routes/project/[id]/+layout.svelte`
- Test: `e2e/graph-view.e2e.ts`

**Interfaces:**

- Consumes: parent layout data `{ project, tasks: (Task & {schedule, layer})[], dependencies }` (existing `+layout.server.ts`); `listPositionsForTasks` (Task 1); `computeBasePositions`, `NODE_SIZE` (Task 2).
- Produces: page data shape `{ project, tasks: (Task & {schedule, layer, x, y})[], dependencies }`, consumed by every later task in this plan; `GraphNode.svelte` accepting a `task` prop, extended by later tasks.

- [ ] **Step 1: Write the graph route load**

Create `src/routes/project/[id]/graph/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import { listPositionsForTasks } from '$lib/server/repositories/positions';
import { computeBasePositions } from '$lib/graph-layout';

export const load: PageServerLoad = async ({ parent, platform }) => {
	const { project, tasks, dependencies } = await parent();
	const db = getDb(platform!.env.DB);
	const offsets = await listPositionsForTasks(
		db,
		tasks.map((t) => t.id)
	);
	const basePositions = computeBasePositions(tasks);

	const graphTasks = tasks.map((task) => {
		const base = basePositions.get(task.id)!;
		const offset = offsets.get(task.id) ?? { offsetX: 0, offsetY: 0 };
		return {
			...task,
			x: base.x + offset.offsetX,
			y: base.y + offset.offsetY
		};
	});

	return { project, tasks: graphTasks, dependencies };
};
```

- [ ] **Step 2: Add the List/Graph tab nav**

Modify `src/routes/project/[id]/+layout.svelte`:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	let { data, children } = $props();
</script>

<p><a href={resolve('/')}>&larr; All projects</a></p>
<h1>{data.project.name}</h1>

<nav>
	<a
		href={resolve('/project/[id]/list', { id: String(data.project.id) })}
		aria-current={page.url.pathname.endsWith('/list') ? 'page' : undefined}
	>
		List
	</a>
	<a
		href={resolve('/project/[id]/graph', { id: String(data.project.id) })}
		aria-current={page.url.pathname.endsWith('/graph') ? 'page' : undefined}
	>
		Graph
	</a>
</nav>

{@render children()}
```

- [ ] **Step 3: Write the static node component**

Create `src/routes/project/[id]/graph/GraphNode.svelte`:

```svelte
<script lang="ts">
	import { NODE_SIZE } from '$lib/graph-layout';
	import type { PageData } from './$types';

	let { task }: { task: PageData['tasks'][number] } = $props();
</script>

<g data-task-id={task.id}>
	<rect
		x={task.x}
		y={task.y}
		width={NODE_SIZE}
		height={NODE_SIZE}
		class="node"
		class:critical={task.schedule.onCriticalPath}
		data-status={task.status}
	/>
	<text
		x={task.x + NODE_SIZE / 2}
		y={task.y + NODE_SIZE / 2}
		text-anchor="middle"
		dominant-baseline="middle"
	>
		{task.title}
	</text>
</g>

<style>
	.node {
		fill: white;
		stroke: #333;
		stroke-width: 2;
	}
	.node.critical {
		stroke: crimson;
		stroke-width: 3;
	}
	.node[data-status='done'] {
		fill: #d4f7d4;
	}
	.node[data-status='in_progress'] {
		fill: #fff6cc;
	}
	text {
		font-size: 12px;
		pointer-events: none;
		user-select: none;
	}
</style>
```

- [ ] **Step 4: Write the graph canvas page**

Create `src/routes/project/[id]/graph/+page.svelte`:

```svelte
<script lang="ts">
	import type { PageData } from './$types';
	import GraphNode from './GraphNode.svelte';
	import { NODE_SIZE } from '$lib/graph-layout';

	let { data }: { data: PageData } = $props();

	const VIEW_WIDTH = 900;
	const VIEW_HEIGHT = 600;
</script>

<h2>Graph</h2>

<svg class="graph-canvas" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
	{#each data.dependencies as dep (dep.id)}
		{@const from = data.tasks.find((t) => t.id === dep.predecessorId)}
		{@const to = data.tasks.find((t) => t.id === dep.successorId)}
		{#if from && to}
			<line
				class="edge"
				x1={from.x + NODE_SIZE}
				y1={from.y + NODE_SIZE / 2}
				x2={to.x}
				y2={to.y + NODE_SIZE / 2}
			/>
		{/if}
	{/each}
	{#each data.tasks as task (task.id)}
		<GraphNode {task} />
	{/each}
</svg>

<style>
	.graph-canvas {
		width: 100%;
		height: 80vh;
		border: 1px solid #ccc;
	}
	.edge {
		stroke: #999;
		stroke-width: 2;
	}
</style>
```

- [ ] **Step 5: Write the e2e smoke test**

Create `e2e/graph-view.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('graph view renders tasks and dependency edges', async ({ page }) => {
	const projectName = `E2E Graph ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Buy bread');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByPlaceholder('Title').fill('Spread peanut butter');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	const predecessorSelect = page.locator('select[name="predecessorId"]');
	const successorSelect = page.locator('select[name="successorId"]');
	await predecessorSelect.selectOption({ label: 'Buy bread' });
	await successorSelect.selectOption({ label: 'Spread peanut butter' });
	await page.getByRole('button', { name: 'Add dependency' }).click();

	await page.getByRole('link', { name: 'Graph' }).click();
	await expect(page.locator('svg.graph-canvas')).toBeVisible();
	await expect(page.locator('g[data-task-id] text').filter({ hasText: 'Buy bread' })).toBeVisible();
	await expect(
		page.locator('g[data-task-id] text').filter({ hasText: 'Spread peanut butter' })
	).toBeVisible();
	await expect(page.locator('line.edge')).toHaveCount(1);
});
```

- [ ] **Step 6: Run the e2e test**

Run: `npx playwright test e2e/graph-view.e2e.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/project e2e/graph-view.e2e.ts
git commit -m "feat: add graph route scaffold with static rendering"
```

---

## Task 5: Pan and zoom

**Files:**

- Modify: `src/routes/project/[id]/graph/+page.svelte`
- Test: `e2e/graph-pan-zoom.e2e.ts`

**Interfaces:**

- Consumes: `DEFAULT_VIEWPORT`, `panViewport`, `zoomViewportAtPoint`, `Viewport` (Task 3).

- [ ] **Step 1: Wire pan (drag empty canvas) and zoom (wheel) into the page**

Modify `src/routes/project/[id]/graph/+page.svelte` script block:

```svelte
<script lang="ts">
	import type { PageData } from './$types';
	import GraphNode from './GraphNode.svelte';
	import { NODE_SIZE } from '$lib/graph-layout';
	import {
		DEFAULT_VIEWPORT,
		panViewport,
		zoomViewportAtPoint,
		type Viewport
	} from '$lib/graph-viewport';

	let { data }: { data: PageData } = $props();

	const VIEW_WIDTH = 900;
	const VIEW_HEIGHT = 600;

	let viewport = $state<Viewport>(DEFAULT_VIEWPORT);
	let svgEl: SVGSVGElement;
	let panning = $state(false);
	let lastPointer = { x: 0, y: 0 };

	let viewBox = $derived(
		`${viewport.x} ${viewport.y} ${VIEW_WIDTH / viewport.scale} ${VIEW_HEIGHT / viewport.scale}`
	);

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const rect = svgEl.getBoundingClientRect();
		const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		viewport = zoomViewportAtPoint(viewport, { x: e.clientX, y: e.clientY }, rect, zoomFactor);
	}

	function handleBackgroundPointerDown(e: PointerEvent) {
		if (e.target !== svgEl) return;
		panning = true;
		lastPointer = { x: e.clientX, y: e.clientY };
		svgEl.setPointerCapture(e.pointerId);
	}

	function handleBackgroundPointerMove(e: PointerEvent) {
		if (!panning) return;
		const dx = e.clientX - lastPointer.x;
		const dy = e.clientY - lastPointer.y;
		lastPointer = { x: e.clientX, y: e.clientY };
		viewport = panViewport(viewport, dx, dy);
	}

	function handleBackgroundPointerUp() {
		panning = false;
	}
</script>

<h2>Graph</h2>

<svg
	bind:this={svgEl}
	class="graph-canvas"
	{viewBox}
	onwheel={handleWheel}
	onpointerdown={handleBackgroundPointerDown}
	onpointermove={handleBackgroundPointerMove}
	onpointerup={handleBackgroundPointerUp}
>
	{#each data.dependencies as dep (dep.id)}
		{@const from = data.tasks.find((t) => t.id === dep.predecessorId)}
		{@const to = data.tasks.find((t) => t.id === dep.successorId)}
		{#if from && to}
			<line
				class="edge"
				x1={from.x + NODE_SIZE}
				y1={from.y + NODE_SIZE / 2}
				x2={to.x}
				y2={to.y + NODE_SIZE / 2}
			/>
		{/if}
	{/each}
	{#each data.tasks as task (task.id)}
		<GraphNode {task} />
	{/each}
</svg>

<style>
	.graph-canvas {
		width: 100%;
		height: 80vh;
		border: 1px solid #ccc;
		touch-action: none;
	}
	.edge {
		stroke: #999;
		stroke-width: 2;
	}
</style>
```

- [ ] **Step 2: Write the e2e test**

Create `e2e/graph-pan-zoom.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('panning and zooming change the canvas viewBox', async ({ page }) => {
	const projectName = `E2E Pan Zoom ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();
	await page.getByRole('link', { name: 'Graph' }).click();

	const canvas = page.locator('svg.graph-canvas');
	const initialViewBox = await canvas.getAttribute('viewBox');

	const box = await canvas.boundingBox();
	if (!box) throw new Error('canvas not visible');

	// Pan by dragging the empty background.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 - 30);
	await page.mouse.up();
	const pannedViewBox = await canvas.getAttribute('viewBox');
	expect(pannedViewBox).not.toBe(initialViewBox);

	// Zoom in with the wheel.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, -200);
	const zoomedViewBox = await canvas.getAttribute('viewBox');
	expect(zoomedViewBox).not.toBe(pannedViewBox);
});
```

- [ ] **Step 3: Run the e2e test**

Run: `npx playwright test e2e/graph-pan-zoom.e2e.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/project/[id]/graph/+page.svelte e2e/graph-pan-zoom.e2e.ts
git commit -m "feat: add pan and zoom to the graph canvas"
```

---

## Task 6: PATCH endpoint for non-structural updates

**Files:**

- Create: `src/routes/project/[id]/graph/+server.ts`
- Test: `e2e/graph-patch-endpoint.e2e.ts`

**Interfaces:**

- Consumes: `upsertPosition` (Task 1); `updateTask`, `listTasksForProject` (existing `$lib/server/repositories/tasks`); `listDependenciesForProject` (existing `$lib/server/repositories/dependencies`); `computeSchedule` (existing `$lib/server/scheduling/cpm`).
- Produces: `PATCH /project/[id]/graph` accepting `{ type: 'position'; taskId; offsetX; offsetY }` → `{ ok: true }`, or `{ type: 'fields'; taskId; patch: { title?; description?; status?; durationDays? } }` → `{ ok: true; tasks: { id: number; schedule: ScheduleEntry }[] }` — consumed by Task 7 (position), Task 8 (title), Task 12 (description/duration/status).

- [ ] **Step 1: Implement the endpoint**

Create `src/routes/project/[id]/graph/+server.ts`:

```ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import { upsertPosition } from '$lib/server/repositories/positions';
import { updateTask, listTasksForProject, type TaskPatch } from '$lib/server/repositories/tasks';
import { listDependenciesForProject } from '$lib/server/repositories/dependencies';
import { computeSchedule } from '$lib/server/scheduling/cpm';

type PatchBody =
	| { type: 'position'; taskId: number; offsetX: number; offsetY: number }
	| { type: 'fields'; taskId: number; patch: TaskPatch };

export const PATCH: RequestHandler = async ({ request, params, platform }) => {
	const db = getDb(platform!.env.DB);
	const projectId = Number(params.id);
	const body = (await request.json()) as PatchBody;

	if (body.type === 'position') {
		await upsertPosition(db, body.taskId, body.offsetX, body.offsetY);
		return json({ ok: true });
	}

	await updateTask(db, body.taskId, body.patch);
	const tasks = await listTasksForProject(db, projectId);
	const dependencies = await listDependenciesForProject(db, projectId);
	const schedule = computeSchedule(
		tasks.map((t) => ({ id: t.id, durationDays: t.durationDays })),
		dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId }))
	);
	return json({
		ok: true,
		tasks: tasks.map((t) => ({ id: t.id, schedule: schedule.get(t.id)! }))
	});
};
```

- [ ] **Step 2: Write the e2e test**

Create `e2e/graph-patch-endpoint.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('PATCH endpoint updates position and fields', async ({ page, request }) => {
	const projectName = `E2E Patch ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Solo task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	const projectUrl = page.url();
	const projectId = projectUrl.match(/\/project\/(\d+)\//)?.[1];
	if (!projectId) throw new Error('could not extract project id from URL');

	const taskIdInput = await page
		.locator('li')
		.filter({ hasText: 'Solo task' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');
	const taskId = Number(taskIdInput);

	const positionResponse = await request.fetch(`/project/${projectId}/graph`, {
		method: 'PATCH',
		data: { type: 'position', taskId, offsetX: 42, offsetY: 7 }
	});
	expect(positionResponse.ok()).toBe(true);
	expect(await positionResponse.json()).toEqual({ ok: true });

	const fieldsResponse = await request.fetch(`/project/${projectId}/graph`, {
		method: 'PATCH',
		data: { type: 'fields', taskId, patch: { durationDays: 5 } }
	});
	expect(fieldsResponse.ok()).toBe(true);
	const fieldsBody = await fieldsResponse.json();
	expect(fieldsBody.ok).toBe(true);
	expect(
		fieldsBody.tasks.find((t: { id: number }) => t.id === taskId).schedule.earliestFinish
	).toBe(5);
});
```

- [ ] **Step 3: Run the e2e test**

Run: `npx playwright test e2e/graph-patch-endpoint.e2e.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/project/[id]/graph/+server.ts e2e/graph-patch-endpoint.e2e.ts
git commit -m "feat: add PATCH endpoint for non-structural graph edits"
```

---

## Task 7: Drag a node to reposition it

**Files:**

- Modify: `src/routes/project/[id]/graph/GraphNode.svelte`
- Modify: `src/routes/project/[id]/graph/+page.svelte`
- Test: `e2e/graph-drag-reposition.e2e.ts`

**Interfaces:**

- Consumes: `PATCH /project/[id]/graph` with `type: 'position'` (Task 6); `screenToSvg`, `Viewport` (Task 3).
- Produces: `GraphNode` prop `onDragEnd: (taskId: number, absoluteX: number, absoluteY: number) => void` (the node's final absolute graph position, not an offset — the parent subtracts the task's base position before persisting), consumed (extended) by Task 12's click-vs-drag disambiguation.

- [ ] **Step 1: Add drag handling to GraphNode**

Modify `src/routes/project/[id]/graph/GraphNode.svelte`:

```svelte
<script lang="ts">
	import { NODE_SIZE } from '$lib/graph-layout';
	import { screenToSvg, type Rect, type Viewport } from '$lib/graph-viewport';
	import type { PageData } from './$types';

	let {
		task,
		viewport,
		canvasRect,
		onDragEnd
	}: {
		task: PageData['tasks'][number];
		viewport: Viewport;
		canvasRect: Rect;
		onDragEnd: (taskId: number, offsetX: number, offsetY: number) => void;
	} = $props();

	let dragging = $state(false);
	let dragStartSvg = { x: 0, y: 0 };
	let dragStartTask = { x: 0, y: 0 };
	let moved = 0;

	function handlePointerDown(e: PointerEvent) {
		dragging = true;
		moved = 0;
		dragStartSvg = screenToSvg({ x: e.clientX, y: e.clientY }, canvasRect, viewport);
		dragStartTask = { x: task.x, y: task.y };
		(e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const current = screenToSvg({ x: e.clientX, y: e.clientY }, canvasRect, viewport);
		const dx = current.x - dragStartSvg.x;
		const dy = current.y - dragStartSvg.y;
		moved = Math.max(moved, Math.hypot(dx, dy));
		task.x = dragStartTask.x + dx;
		task.y = dragStartTask.y + dy;
	}

	function handlePointerUp() {
		if (!dragging) return;
		dragging = false;
		if (moved < 4) return;
		onDragEnd(task.id, task.x, task.y);
	}
</script>

<g
	data-task-id={task.id}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
>
	<rect
		x={task.x}
		y={task.y}
		width={NODE_SIZE}
		height={NODE_SIZE}
		class="node"
		class:critical={task.schedule.onCriticalPath}
		data-status={task.status}
	/>
	<text
		x={task.x + NODE_SIZE / 2}
		y={task.y + NODE_SIZE / 2}
		text-anchor="middle"
		dominant-baseline="middle"
	>
		{task.title}
	</text>
</g>

<style>
	.node {
		fill: white;
		stroke: #333;
		stroke-width: 2;
		cursor: grab;
	}
	.node.critical {
		stroke: crimson;
		stroke-width: 3;
	}
	.node[data-status='done'] {
		fill: #d4f7d4;
	}
	.node[data-status='in_progress'] {
		fill: #fff6cc;
	}
	text {
		font-size: 12px;
		pointer-events: none;
		user-select: none;
	}
</style>
```

Note: `onDragEnd` reports the node's final **absolute** graph position (`task.x`/`task.y`, not an offset); the parent converts that to an offset relative to the task's base position before sending it to the PATCH endpoint, since `task_positions` stores an offset, not an absolute position.

- [ ] **Step 2: Wire drag persistence into the page**

Modify `src/routes/project/[id]/graph/+page.svelte`: add a `basePositionOf` lookup (recomputed once from the loaded data, since `task.x`/`task.y` mutate during drag but the base position doesn't change until the next structural reload), pass `viewport`/`canvasRect`/`onDragEnd` to each `GraphNode`, and PATCH on drag end.

```svelte
<script lang="ts">
	import type { PageData } from './$types';
	import GraphNode from './GraphNode.svelte';
	import { NODE_SIZE, computeBasePositions } from '$lib/graph-layout';
	import {
		DEFAULT_VIEWPORT,
		panViewport,
		zoomViewportAtPoint,
		type Viewport
	} from '$lib/graph-viewport';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();

	const VIEW_WIDTH = 900;
	const VIEW_HEIGHT = 600;

	let viewport = $state<Viewport>(DEFAULT_VIEWPORT);
	let svgEl: SVGSVGElement | undefined = $state();
	let panning = $state(false);
	let lastPointer = { x: 0, y: 0 };

	let tasks = $state(data.tasks.map((t) => ({ ...t })));
	$effect(() => {
		tasks = data.tasks.map((t) => ({ ...t }));
	});

	let basePositions = $derived(computeBasePositions(data.tasks));

	let viewBox = $derived(
		`${viewport.x} ${viewport.y} ${VIEW_WIDTH / viewport.scale} ${VIEW_HEIGHT / viewport.scale}`
	);

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const rect = svgEl!.getBoundingClientRect();
		const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		viewport = zoomViewportAtPoint(viewport, { x: e.clientX, y: e.clientY }, rect, zoomFactor);
	}

	function handleBackgroundPointerDown(e: PointerEvent) {
		if (e.target !== svgEl) return;
		panning = true;
		lastPointer = { x: e.clientX, y: e.clientY };
		svgEl!.setPointerCapture(e.pointerId);
	}

	function handleBackgroundPointerMove(e: PointerEvent) {
		if (!panning) return;
		const dx = e.clientX - lastPointer.x;
		const dy = e.clientY - lastPointer.y;
		lastPointer = { x: e.clientX, y: e.clientY };
		viewport = panViewport(viewport, dx, dy);
	}

	function handleBackgroundPointerUp() {
		panning = false;
	}

	async function handleDragEnd(taskId: number, absoluteX: number, absoluteY: number) {
		const base = basePositions.get(taskId)!;
		await fetch(resolve('/project/[id]/graph', { id: String(data.project.id) }), {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				type: 'position',
				taskId,
				offsetX: absoluteX - base.x,
				offsetY: absoluteY - base.y
			})
		});
	}
</script>

<h2>Graph</h2>

<svg
	bind:this={svgEl}
	class="graph-canvas"
	{viewBox}
	onwheel={handleWheel}
	onpointerdown={handleBackgroundPointerDown}
	onpointermove={handleBackgroundPointerMove}
	onpointerup={handleBackgroundPointerUp}
>
	{#each data.dependencies as dep (dep.id)}
		{@const from = tasks.find((t) => t.id === dep.predecessorId)}
		{@const to = tasks.find((t) => t.id === dep.successorId)}
		{#if from && to}
			<line
				class="edge"
				x1={from.x + NODE_SIZE}
				y1={from.y + NODE_SIZE / 2}
				x2={to.x}
				y2={to.y + NODE_SIZE / 2}
			/>
		{/if}
	{/each}
	{#if svgEl}
		{#each tasks as task (task.id)}
			<GraphNode
				{task}
				{viewport}
				canvasRect={svgEl.getBoundingClientRect()}
				onDragEnd={handleDragEnd}
			/>
		{/each}
	{/if}
</svg>

<style>
	.graph-canvas {
		width: 100%;
		height: 80vh;
		border: 1px solid #ccc;
		touch-action: none;
	}
	.edge {
		stroke: #999;
		stroke-width: 2;
	}
</style>
```

- [ ] **Step 3: Write the e2e test**

Create `e2e/graph-drag-reposition.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('dragging a node persists its position across reload', async ({ page }) => {
	const projectName = `E2E Drag ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Draggable task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('link', { name: 'Graph' }).click();

	const node = page.locator('g[data-task-id] rect.node');
	const box = await node.boundingBox();
	if (!box) throw new Error('node not visible');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 });
	await page.mouse.up();

	// Give the fire-and-forget PATCH a moment to land before reloading.
	await page.waitForTimeout(200);
	await page.reload();

	const reloadedBox = await page.locator('g[data-task-id] rect.node').boundingBox();
	if (!reloadedBox) throw new Error('node not visible after reload');
	expect(Math.abs(reloadedBox.x - box.x)).toBeGreaterThan(30);
});
```

- [ ] **Step 4: Run the e2e test**

Run: `npx playwright test e2e/graph-drag-reposition.e2e.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/project/[id]/graph e2e/graph-drag-reposition.e2e.ts
git commit -m "feat: add drag-to-reposition with autosaved node positions"
```

---

## Task 8: Inline title editing

**Files:**

- Modify: `src/routes/project/[id]/graph/GraphNode.svelte`
- Modify: `src/routes/project/[id]/graph/+page.svelte`
- Test: `e2e/graph-inline-title-edit.e2e.ts`

**Interfaces:**

- Consumes: `PATCH /project/[id]/graph` with `type: 'fields'` (Task 6).
- Produces: `GraphNode` prop `onTitleChange: (taskId: number, title: string) => void`.

- [ ] **Step 1: Add inline title editing to GraphNode**

Modify `src/routes/project/[id]/graph/GraphNode.svelte`: replace the `<text>` element with a double-click-to-edit `<foreignObject>` input, and add the `onTitleChange` prop.

```svelte
<script lang="ts">
	import { NODE_SIZE } from '$lib/graph-layout';
	import { screenToSvg, type Rect, type Viewport } from '$lib/graph-viewport';
	import type { PageData } from './$types';

	let {
		task,
		viewport,
		canvasRect,
		onDragEnd,
		onTitleChange
	}: {
		task: PageData['tasks'][number];
		viewport: Viewport;
		canvasRect: Rect;
		onDragEnd: (taskId: number, offsetX: number, offsetY: number) => void;
		onTitleChange: (taskId: number, title: string) => void;
	} = $props();

	let dragging = $state(false);
	let dragStartSvg = { x: 0, y: 0 };
	let dragStartTask = { x: 0, y: 0 };
	let moved = 0;
	let editingTitle = $state(false);
	let titleDraft = $state(task.title);

	function handlePointerDown(e: PointerEvent) {
		if (editingTitle) return;
		dragging = true;
		moved = 0;
		dragStartSvg = screenToSvg({ x: e.clientX, y: e.clientY }, canvasRect, viewport);
		dragStartTask = { x: task.x, y: task.y };
		(e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const current = screenToSvg({ x: e.clientX, y: e.clientY }, canvasRect, viewport);
		const dx = current.x - dragStartSvg.x;
		const dy = current.y - dragStartSvg.y;
		moved = Math.max(moved, Math.hypot(dx, dy));
		task.x = dragStartTask.x + dx;
		task.y = dragStartTask.y + dy;
	}

	function handlePointerUp() {
		if (!dragging) return;
		dragging = false;
		if (moved < 4) return;
		onDragEnd(task.id, task.x, task.y);
	}

	function startEditingTitle() {
		titleDraft = task.title;
		editingTitle = true;
	}

	function commitTitle() {
		editingTitle = false;
		if (titleDraft.trim() !== '' && titleDraft !== task.title) {
			task.title = titleDraft;
			onTitleChange(task.id, titleDraft);
		}
	}

	function focusOnMount(el: HTMLInputElement) {
		el.focus();
		el.select();
	}
</script>

<g
	data-task-id={task.id}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	ondblclick={startEditingTitle}
>
	<rect
		x={task.x}
		y={task.y}
		width={NODE_SIZE}
		height={NODE_SIZE}
		class="node"
		class:critical={task.schedule.onCriticalPath}
		data-status={task.status}
	/>
	{#if editingTitle}
		<foreignObject x={task.x + 4} y={task.y + NODE_SIZE / 2 - 10} width={NODE_SIZE - 8} height="20">
			<input
				class="title-input"
				value={titleDraft}
				use:focusOnMount
				oninput={(e) => (titleDraft = (e.target as HTMLInputElement).value)}
				onblur={commitTitle}
				onkeydown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
			/>
		</foreignObject>
	{:else}
		<text
			x={task.x + NODE_SIZE / 2}
			y={task.y + NODE_SIZE / 2}
			text-anchor="middle"
			dominant-baseline="middle"
		>
			{task.title}
		</text>
	{/if}
</g>

<style>
	.node {
		fill: white;
		stroke: #333;
		stroke-width: 2;
		cursor: grab;
	}
	.node.critical {
		stroke: crimson;
		stroke-width: 3;
	}
	.node[data-status='done'] {
		fill: #d4f7d4;
	}
	.node[data-status='in_progress'] {
		fill: #fff6cc;
	}
	text {
		font-size: 12px;
		pointer-events: none;
		user-select: none;
	}
	.title-input {
		width: 100%;
		height: 100%;
		font-size: 12px;
		box-sizing: border-box;
	}
</style>
```

- [ ] **Step 2: Wire title-change persistence into the page**

Modify `src/routes/project/[id]/graph/+page.svelte`: add `handleTitleChange` and pass it to `GraphNode`.

```svelte
	async function handleTitleChange(taskId: number, title: string) {
		await fetch(resolve('/project/[id]/graph', { id: String(data.project.id) }), {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'fields', taskId, patch: { title } })
		});
	}
```

And in the template:

```svelte
<GraphNode
	{task}
	{viewport}
	canvasRect={svgEl.getBoundingClientRect()}
	onDragEnd={handleDragEnd}
	onTitleChange={handleTitleChange}
/>
```

- [ ] **Step 3: Write the e2e test**

Create `e2e/graph-inline-title-edit.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('editing a title inline persists across reload', async ({ page }) => {
	const projectName = `E2E Title Edit ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Original title');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('link', { name: 'Graph' }).click();

	await page.locator('g[data-task-id] rect.node').dblclick();
	const input = page.locator('.title-input');
	await input.fill('Renamed title');
	await input.blur();

	await page.waitForTimeout(200);
	await page.reload();

	await expect(
		page.locator('g[data-task-id] text').filter({ hasText: 'Renamed title' })
	).toBeVisible();
});
```

- [ ] **Step 4: Run the e2e test**

Run: `npx playwright test e2e/graph-inline-title-edit.e2e.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/project/[id]/graph e2e/graph-inline-title-edit.e2e.ts
git commit -m "feat: add inline title editing to graph nodes"
```

---

## Task 9: Hover "+" creates a connected successor task

**Files:**

- Modify: `src/routes/project/[id]/graph/GraphNode.svelte`
- Modify: `src/routes/project/[id]/graph/+page.server.ts` (add `createSuccessor` action)
- Test: `e2e/graph-create-successor.e2e.ts`

**Interfaces:**

- Consumes: `createTask`, `NewTaskInput` (existing `$lib/server/repositories/tasks`); `createDependency` (existing `$lib/server/repositories/dependencies`).
- Produces: form action `createSuccessor` at `/project/[id]/graph?/createSuccessor` accepting `predecessorId`; `GraphNode` prop `onCreateSuccessor: (predecessorId: number) => void`.

- [ ] **Step 1: Add the createSuccessor action**

Modify `src/routes/project/[id]/graph/+page.server.ts` to add an `actions` export alongside the existing `load`:

```ts
import { type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import { listPositionsForTasks } from '$lib/server/repositories/positions';
import { computeBasePositions } from '$lib/graph-layout';
import { createTask } from '$lib/server/repositories/tasks';
import { createDependency } from '$lib/server/repositories/dependencies';

export const load: PageServerLoad = async ({ parent, platform }) => {
	const { project, tasks, dependencies } = await parent();
	const db = getDb(platform!.env.DB);
	const offsets = await listPositionsForTasks(
		db,
		tasks.map((t) => t.id)
	);
	const basePositions = computeBasePositions(tasks);

	const graphTasks = tasks.map((task) => {
		const base = basePositions.get(task.id)!;
		const offset = offsets.get(task.id) ?? { offsetX: 0, offsetY: 0 };
		return {
			...task,
			x: base.x + offset.offsetX,
			y: base.y + offset.offsetY
		};
	});

	return { project, tasks: graphTasks, dependencies };
};

export const actions: Actions = {
	createSuccessor: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const predecessorId = Number(data.get('predecessorId'));
		const projectId = Number(params.id);

		const task = await createTask(db, {
			projectId,
			title: 'New task',
			description: '',
			type: 'task',
			durationDays: 1
		});
		await createDependency(db, projectId, predecessorId, task.id);
	}
};
```

- [ ] **Step 2: Add the hover "+" button to GraphNode**

Modify `src/routes/project/[id]/graph/GraphNode.svelte`: add a `hovering` state, an `onCreateSuccessor` prop, `pointerenter`/`pointerleave` on the `<g>`, and a "+" button positioned above the node.

```svelte
<script lang="ts">
	// ...existing imports and props...
	let {
		task,
		viewport,
		canvasRect,
		onDragEnd,
		onTitleChange,
		onCreateSuccessor
	}: {
		task: PageData['tasks'][number];
		viewport: Viewport;
		canvasRect: Rect;
		onDragEnd: (taskId: number, offsetX: number, offsetY: number) => void;
		onTitleChange: (taskId: number, title: string) => void;
		onCreateSuccessor: (predecessorId: number) => void;
	} = $props();

	let hovering = $state(false);
	// ...existing drag/title state...
</script>

<g
	data-task-id={task.id}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	ondblclick={startEditingTitle}
	onpointerenter={() => (hovering = true)}
	onpointerleave={() => (hovering = false)}
>
	<rect
		x={task.x}
		y={task.y}
		width={NODE_SIZE}
		height={NODE_SIZE}
		class="node"
		class:critical={task.schedule.onCriticalPath}
		data-status={task.status}
	/>
	{#if editingTitle}
		<foreignObject x={task.x + 4} y={task.y + NODE_SIZE / 2 - 10} width={NODE_SIZE - 8} height="20">
			<input
				class="title-input"
				value={titleDraft}
				use:focusOnMount
				oninput={(e) => (titleDraft = (e.target as HTMLInputElement).value)}
				onblur={commitTitle}
				onkeydown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
			/>
		</foreignObject>
	{:else}
		<text
			x={task.x + NODE_SIZE / 2}
			y={task.y + NODE_SIZE / 2}
			text-anchor="middle"
			dominant-baseline="middle"
		>
			{task.title}
		</text>
	{/if}
	{#if hovering}
		<g class="add-successor-button" onclick={() => onCreateSuccessor(task.id)}>
			<circle cx={task.x + NODE_SIZE / 2} cy={task.y + NODE_SIZE + 14} r="10" />
			<text
				x={task.x + NODE_SIZE / 2}
				y={task.y + NODE_SIZE + 14}
				text-anchor="middle"
				dominant-baseline="middle">+</text
			>
		</g>
	{/if}
</g>

<style>
	/* ...existing styles... */
	.add-successor-button {
		cursor: pointer;
	}
	.add-successor-button circle {
		fill: #333;
	}
	.add-successor-button text {
		fill: white;
		pointer-events: none;
		font-size: 14px;
	}
</style>
```

- [ ] **Step 3: Wire createSuccessor as a hidden-form submission from the page**

Modify `src/routes/project/[id]/graph/+page.svelte`: add a hidden form (same pattern as the List view's reorder form) and an `onCreateSuccessor` handler.

```svelte
	let createSuccessorForm: HTMLFormElement;
	let predecessorIdInput: HTMLInputElement;

	function handleCreateSuccessor(predecessorId: number) {
		predecessorIdInput.value = String(predecessorId);
		createSuccessorForm.requestSubmit();
	}
```

```svelte
<form
	bind:this={createSuccessorForm}
	method="POST"
	action="?/createSuccessor"
	use:enhance
	style="display: none"
>
	<input bind:this={predecessorIdInput} type="hidden" name="predecessorId" value="" />
</form>
```

(Add `import { enhance } from '$app/forms';` to the script block, and pass `onCreateSuccessor={handleCreateSuccessor}` to each `GraphNode`.)

- [ ] **Step 4: Write the e2e test**

Create `e2e/graph-create-successor.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('hovering a node and clicking + creates a connected successor', async ({ page }) => {
	const projectName = `E2E Create Successor ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Root task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('link', { name: 'Graph' }).click();

	await expect(page.locator('g[data-task-id]')).toHaveCount(1);

	await page.locator('g[data-task-id] rect.node').hover();
	await page.locator('.add-successor-button').click();

	await expect(page.locator('g[data-task-id]')).toHaveCount(2);
	await expect(page.locator('line.edge')).toHaveCount(1);
});
```

- [ ] **Step 5: Run the e2e test**

Run: `npx playwright test e2e/graph-create-successor.e2e.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/project/[id]/graph e2e/graph-create-successor.e2e.ts
git commit -m "feat: add hover-to-add connected successor task"
```

---

## Task 10: Drag-from-handle to connect two existing nodes

**Files:**

- Modify: `src/routes/project/[id]/graph/GraphNode.svelte`
- Modify: `src/routes/project/[id]/graph/+page.svelte`
- Modify: `src/routes/project/[id]/graph/+page.server.ts` (add `createDependency` action with layer-change offset reset)
- Test: `e2e/graph-connect-nodes.e2e.ts`

**Interfaces:**

- Consumes: `createDependency`, `CycleError` (existing `$lib/server/repositories/dependencies`); `listTasksForProject`, `listDependenciesForProject` (existing repositories); `computeLayers` (existing `$lib/server/scheduling/layout`); `taskIdsWithChangedLayer` (Task 1); `resetPosition` (Task 1).
- Produces: form action `createDependency` at `/project/[id]/graph?/createDependency` accepting `predecessorId`/`successorId`, returning `fail(400, { formName: 'createDependency', error })` on a cycle; `GraphNode` props `onConnectorDragStart: (taskId: number) => void`, `onConnectorDrop: (successorId: number) => void`, `connectorDragActive: boolean` (to show valid-drop-target styling).

- [ ] **Step 1: Add the createDependency action with offset reset**

Modify `src/routes/project/[id]/graph/+page.server.ts`, adding to the existing `actions` object and a private helper:

```ts
import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import type { Db } from '$lib/server/db/client';
import { listPositionsForTasks, resetPosition } from '$lib/server/repositories/positions';
import { computeBasePositions } from '$lib/graph-layout';
import { createTask, listTasksForProject } from '$lib/server/repositories/tasks';
import {
	createDependency as createDependencyEdge,
	listDependenciesForProject,
	CycleError
} from '$lib/server/repositories/dependencies';
import { computeLayers } from '$lib/server/scheduling/layout';
import { taskIdsWithChangedLayer } from '$lib/server/scheduling/offset-reset';

export const load: PageServerLoad = async ({ parent, platform }) => {
	const { project, tasks, dependencies } = await parent();
	const db = getDb(platform!.env.DB);
	const offsets = await listPositionsForTasks(
		db,
		tasks.map((t) => t.id)
	);
	const basePositions = computeBasePositions(tasks);

	const graphTasks = tasks.map((task) => {
		const base = basePositions.get(task.id)!;
		const offset = offsets.get(task.id) ?? { offsetX: 0, offsetY: 0 };
		return {
			...task,
			x: base.x + offset.offsetX,
			y: base.y + offset.offsetY
		};
	});

	return { project, tasks: graphTasks, dependencies };
};

async function currentLayers(db: Db, projectId: number) {
	const tasks = await listTasksForProject(db, projectId);
	const dependencies = await listDependenciesForProject(db, projectId);
	return computeLayers(
		tasks.map((t) => t.id),
		dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId }))
	);
}

async function resetOffsetsForChangedLayers(
	db: Db,
	projectId: number,
	before: Map<number, number>
) {
	const after = await currentLayers(db, projectId);
	for (const taskId of taskIdsWithChangedLayer(before, after)) {
		await resetPosition(db, taskId);
	}
}

export const actions: Actions = {
	createSuccessor: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const predecessorId = Number(data.get('predecessorId'));
		const projectId = Number(params.id);

		const task = await createTask(db, {
			projectId,
			title: 'New task',
			description: '',
			type: 'task',
			durationDays: 1
		});
		await createDependencyEdge(db, projectId, predecessorId, task.id);
	},

	createDependency: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const predecessorId = Number(data.get('predecessorId'));
		const successorId = Number(data.get('successorId'));
		const projectId = Number(params.id);

		const before = await currentLayers(db, projectId);
		try {
			await createDependencyEdge(db, projectId, predecessorId, successorId);
		} catch (err) {
			if (err instanceof CycleError) {
				return fail(400, { formName: 'createDependency', error: err.message });
			}
			throw err;
		}
		await resetOffsetsForChangedLayers(db, projectId, before);
	}
};
```

- [ ] **Step 2: Add a connector handle and live drag-line to GraphNode**

Modify `src/routes/project/[id]/graph/GraphNode.svelte`: add `onConnectorDragStart`, `onConnectorDrop`, and `connectorDragActive` props, a handle circle on the node's right edge, and drop-target highlighting.

```svelte
<script lang="ts">
	// ...existing imports and props, extended with:
	let {
		task,
		viewport,
		canvasRect,
		onDragEnd,
		onTitleChange,
		onCreateSuccessor,
		onConnectorDragStart,
		onConnectorDrop,
		connectorDragActive
	}: {
		task: PageData['tasks'][number];
		viewport: Viewport;
		canvasRect: Rect;
		onDragEnd: (taskId: number, offsetX: number, offsetY: number) => void;
		onTitleChange: (taskId: number, title: string) => void;
		onCreateSuccessor: (predecessorId: number) => void;
		onConnectorDragStart: (taskId: number) => void;
		onConnectorDrop: (successorId: number) => void;
		connectorDragActive: boolean;
	} = $props();
	// ...existing state...
</script>

<g
	data-task-id={task.id}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={(e) => {
		handlePointerUp();
		if (connectorDragActive) onConnectorDrop(task.id);
	}}
	ondblclick={startEditingTitle}
	onpointerenter={() => (hovering = true)}
	onpointerleave={() => (hovering = false)}
>
	<rect
		x={task.x}
		y={task.y}
		width={NODE_SIZE}
		height={NODE_SIZE}
		class="node"
		class:critical={task.schedule.onCriticalPath}
		class:drop-target={connectorDragActive}
		data-status={task.status}
	/>
	<!-- ...title/foreignObject/text unchanged... -->
	{#if hovering}
		<g class="add-successor-button" onclick={() => onCreateSuccessor(task.id)}>
			<circle cx={task.x + NODE_SIZE / 2} cy={task.y + NODE_SIZE + 14} r="10" />
			<text
				x={task.x + NODE_SIZE / 2}
				y={task.y + NODE_SIZE + 14}
				text-anchor="middle"
				dominant-baseline="middle">+</text
			>
		</g>
		<circle
			class="connector-handle"
			cx={task.x + NODE_SIZE}
			cy={task.y + NODE_SIZE / 2}
			r="6"
			onpointerdown={(e) => {
				e.stopPropagation();
				onConnectorDragStart(task.id);
			}}
		/>
	{/if}
</g>

<style>
	/* ...existing styles..., plus: */
	.node.drop-target {
		stroke: seagreen;
		stroke-width: 4;
	}
	.connector-handle {
		fill: steelblue;
		cursor: crosshair;
	}
</style>
```

- [ ] **Step 3: Add connector-drag state and a live preview line to the page**

Modify `src/routes/project/[id]/graph/+page.svelte`: add connector-drag state, a document-level pointermove/pointerup listener while dragging, a preview `<line>`, hidden `createDependency` form submission, and error display.

```svelte
	import type { ActionData } from './$types';
	// ...
	let { data, form }: { data: PageData; form: ActionData } = $props();
	// ...

	let connectorFrom = $state<number | null>(null);
	let connectorPointer = $state<{ x: number; y: number } | null>(null);

	function handleConnectorDragStart(taskId: number) {
		connectorFrom = taskId;
	}

	function handleWindowPointerMove(e: PointerEvent) {
		if (connectorFrom === null || !svgEl) return;
		connectorPointer = screenToSvg({ x: e.clientX, y: e.clientY }, svgEl.getBoundingClientRect(), viewport);
	}

	function handleWindowPointerUp() {
		connectorFrom = null;
		connectorPointer = null;
	}

	let createDependencyForm: HTMLFormElement;
	let dependencyPredecessorInput: HTMLInputElement;
	let dependencySuccessorInput: HTMLInputElement;

	function handleConnectorDrop(successorId: number) {
		if (connectorFrom === null) return;
		dependencyPredecessorInput.value = String(connectorFrom);
		dependencySuccessorInput.value = String(successorId);
		createDependencyForm.requestSubmit();
		connectorFrom = null;
		connectorPointer = null;
	}
```

Add `screenToSvg` to the existing `$lib/graph-viewport` import, add `svelte:window` listeners, the preview line, the hidden form, and error text to the markup:

```svelte
<svelte:window onpointermove={handleWindowPointerMove} onpointerup={handleWindowPointerUp} />

<svg ...>
	<!-- ...existing edges and nodes... -->
	{#if connectorFrom !== null && connectorPointer}
		{@const source = tasks.find((t) => t.id === connectorFrom)}
		{#if source}
			<line
				class="connector-preview"
				x1={source.x + NODE_SIZE}
				y1={source.y + NODE_SIZE / 2}
				x2={connectorPointer.x}
				y2={connectorPointer.y}
			/>
		{/if}
	{/if}
	{#each tasks as task (task.id)}
		<GraphNode
			{task}
			{viewport}
			canvasRect={svgEl.getBoundingClientRect()}
			onDragEnd={handleDragEnd}
			onTitleChange={handleTitleChange}
			onCreateSuccessor={handleCreateSuccessor}
			onConnectorDragStart={handleConnectorDragStart}
			onConnectorDrop={handleConnectorDrop}
			connectorDragActive={connectorFrom !== null && connectorFrom !== task.id}
		/>
	{/each}
</svg>

<form
	bind:this={createDependencyForm}
	method="POST"
	action="?/createDependency"
	use:enhance
	style="display: none"
>
	<input bind:this={dependencyPredecessorInput} type="hidden" name="predecessorId" value="" />
	<input bind:this={dependencySuccessorInput} type="hidden" name="successorId" value="" />
</form>
{#if form?.formName === 'createDependency' && form.error}
	<p class="error">{form.error}</p>
{/if}
```

Add `.connector-preview { stroke: steelblue; stroke-width: 2; stroke-dasharray: 4; }` to the `<style>` block.

- [ ] **Step 4: Write the e2e test**

Create `e2e/graph-connect-nodes.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('drag-connecting two nodes creates a dependency, and the reverse is rejected as a cycle', async ({
	page
}) => {
	const projectName = `E2E Connect ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('First');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByPlaceholder('Title').fill('Second');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('link', { name: 'Graph' }).click();

	const nodes = page.locator('g[data-task-id]');
	const firstNode = nodes.first();
	const secondNode = nodes.nth(1);

	await firstNode.locator('rect.node').hover();
	const handle = firstNode.locator('.connector-handle');
	const handleBox = await handle.boundingBox();
	const secondBox = await secondNode.locator('rect.node').boundingBox();
	if (!handleBox || !secondBox) throw new Error('elements not visible');

	await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, {
		steps: 5
	});
	await page.mouse.up();

	await expect(page.locator('line.edge')).toHaveCount(1);

	// Attempt the reverse connection — should be rejected as a cycle.
	await secondNode.locator('rect.node').hover();
	const reverseHandle = secondNode.locator('.connector-handle');
	const reverseHandleBox = await reverseHandle.boundingBox();
	const firstBox = await firstNode.locator('rect.node').boundingBox();
	if (!reverseHandleBox || !firstBox) throw new Error('elements not visible');

	await page.mouse.move(
		reverseHandleBox.x + reverseHandleBox.width / 2,
		reverseHandleBox.y + reverseHandleBox.height / 2
	);
	await page.mouse.down();
	await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2, {
		steps: 5
	});
	await page.mouse.up();

	await expect(page.getByText('This dependency would create a cycle')).toBeVisible();
	await expect(page.locator('line.edge')).toHaveCount(1);
});
```

- [ ] **Step 5: Run the e2e test**

Run: `npx playwright test e2e/graph-connect-nodes.e2e.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/project/[id]/graph e2e/graph-connect-nodes.e2e.ts
git commit -m "feat: add drag-from-handle dependency creation with cycle rejection"
```

---

## Task 11: Delete a task or dependency from the graph

**Files:**

- Modify: `src/routes/project/[id]/graph/GraphNode.svelte`
- Modify: `src/routes/project/[id]/graph/+page.svelte`
- Modify: `src/routes/project/[id]/graph/+page.server.ts` (add `deleteTask`/`deleteDependency` actions with offset reset)
- Test: `e2e/graph-delete.e2e.ts`

**Interfaces:**

- Consumes: `deleteTask` (existing `$lib/server/repositories/tasks`); `deleteDependency` (existing `$lib/server/repositories/dependencies`); `taskIdsWithChangedLayer`, `resetOffsetsForChangedLayers` pattern (Task 10).
- Produces: form actions `deleteTask`/`deleteDependency` at `/project/[id]/graph`; `GraphNode` prop `onDelete: (taskId: number) => void`.

- [ ] **Step 1: Add the delete actions**

Modify `src/routes/project/[id]/graph/+page.server.ts`, adding to `actions`:

```ts
	deleteTask: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const projectId = Number(params.id);
		const before = await currentLayers(db, projectId);
		await deleteTaskRow(db, Number(data.get('id')));
		await resetOffsetsForChangedLayers(db, projectId, before);
	},

	deleteDependency: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const projectId = Number(params.id);
		const before = await currentLayers(db, projectId);
		await deleteDependencyRow(db, Number(data.get('id')));
		await resetOffsetsForChangedLayers(db, projectId, before);
	}
```

Add the corresponding imports at the top, aliasing to avoid clashing with the local action names:

```ts
import {
	createTask,
	listTasksForProject,
	deleteTask as deleteTaskRow
} from '$lib/server/repositories/tasks';
import {
	createDependency as createDependencyEdge,
	deleteDependency as deleteDependencyRow,
	listDependenciesForProject,
	CycleError
} from '$lib/server/repositories/dependencies';
```

- [ ] **Step 2: Add a delete button to GraphNode, shown on hover**

Modify `src/routes/project/[id]/graph/GraphNode.svelte`: add an `onDelete` prop and a small "×" button near the top-right corner of the node, visible when `hovering`.

```svelte
// add to props: onDelete: (taskId: number) => void;
```

```svelte
{#if hovering}
	<!-- ...existing add-successor-button and connector-handle... -->
	<g
		class="delete-button"
		onpointerdown={(e) => e.stopPropagation()}
		onclick={() => onDelete(task.id)}
	>
		<circle cx={task.x + NODE_SIZE - 8} cy={task.y + 8} r="8" />
		<text x={task.x + NODE_SIZE - 8} y={task.y + 8} text-anchor="middle" dominant-baseline="middle"
			>×</text
		>
	</g>
{/if}
```

Note: `onpointerdown` must call `stopPropagation()` here for the same reason the add-successor-button (Task 9) and connector-handle (Task 10) do — the outer `<g>`'s `setPointerCapture` (used for node-reposition drag) otherwise retargets the subsequent `click` event away from this nested button, so it silently never fires.

Add styles: `.delete-button { cursor: pointer; } .delete-button circle { fill: crimson; } .delete-button text { fill: white; pointer-events: none; font-size: 12px; }`.

- [ ] **Step 3: Wire delete as a hidden-form submission, and add edge delete controls**

Modify `src/routes/project/[id]/graph/+page.svelte`: add a hidden `deleteTask` form plus a small clickable delete control per edge (a transparent wider hit-line under each visible edge line, since a plain `<line>` has almost no click area).

```svelte
	let deleteTaskForm: HTMLFormElement;
	let deleteTaskIdInput: HTMLInputElement;

	function handleDeleteTask(taskId: number) {
		deleteTaskIdInput.value = String(taskId);
		deleteTaskForm.requestSubmit();
	}

	let deleteDependencyForm: HTMLFormElement;
	let deleteDependencyIdInput: HTMLInputElement;

	function handleDeleteDependency(dependencyId: number) {
		deleteDependencyIdInput.value = String(dependencyId);
		deleteDependencyForm.requestSubmit();
	}
```

```svelte
{#each data.dependencies as dep (dep.id)}
	{@const from = tasks.find((t) => t.id === dep.predecessorId)}
	{@const to = tasks.find((t) => t.id === dep.successorId)}
	{#if from && to}
		<line
			class="edge"
			x1={from.x + NODE_SIZE}
			y1={from.y + NODE_SIZE / 2}
			x2={to.x}
			y2={to.y + NODE_SIZE / 2}
		/>
		<line
			class="edge-hit-area"
			x1={from.x + NODE_SIZE}
			y1={from.y + NODE_SIZE / 2}
			x2={to.x}
			y2={to.y + NODE_SIZE / 2}
			onclick={() => handleDeleteDependency(dep.id)}
		/>
	{/if}
{/each}
```

```svelte
<form
	bind:this={deleteTaskForm}
	method="POST"
	action="?/deleteTask"
	use:enhance
	style="display: none"
>
	<input bind:this={deleteTaskIdInput} type="hidden" name="id" value="" />
</form>
<form
	bind:this={deleteDependencyForm}
	method="POST"
	action="?/deleteDependency"
	use:enhance
	style="display: none"
>
	<input bind:this={deleteDependencyIdInput} type="hidden" name="id" value="" />
</form>
```

Pass `onDelete={handleDeleteTask}` to each `GraphNode`, and add `.edge-hit-area { stroke: transparent; stroke-width: 14; cursor: pointer; }` to the `<style>` block.

- [ ] **Step 4: Write the e2e test**

Create `e2e/graph-delete.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('deleting a dependency edge and then a task removes them from the graph', async ({ page }) => {
	const projectName = `E2E Delete ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('First');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByPlaceholder('Title').fill('Second');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	const predecessorSelect = page.locator('select[name="predecessorId"]');
	const successorSelect = page.locator('select[name="successorId"]');
	await predecessorSelect.selectOption({ label: 'First' });
	await successorSelect.selectOption({ label: 'Second' });
	await page.getByRole('button', { name: 'Add dependency' }).click();

	await page.getByRole('link', { name: 'Graph' }).click();
	await expect(page.locator('line.edge')).toHaveCount(1);

	await page.locator('.edge-hit-area').click();
	await expect(page.locator('line.edge')).toHaveCount(0);

	await page.locator('g[data-task-id]').first().locator('rect.node').hover();
	await page.locator('.delete-button').click();
	await expect(page.locator('g[data-task-id]')).toHaveCount(1);
});
```

- [ ] **Step 5: Run the e2e test**

Run: `npx playwright test e2e/graph-delete.e2e.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/project/[id]/graph e2e/graph-delete.e2e.ts
git commit -m "feat: add task and dependency deletion from the graph view"
```

---

## Task 12: Description/duration/status popover with live critical-path updates

**Files:**

- Modify: `src/routes/project/[id]/graph/GraphNode.svelte`
- Modify: `src/routes/project/[id]/graph/+page.svelte`
- Test: `e2e/graph-details-popover.e2e.ts`

**Interfaces:**

- Consumes: `PATCH /project/[id]/graph` with `type: 'fields'` (Task 6); `svgToScreen` (Task 3).
- Produces: `GraphNode` prop `onOpenDetails: (taskId: number) => void`, fired on a plain (non-dragging) click.

- [ ] **Step 1: Fire onOpenDetails on a non-drag click**

Modify `src/routes/project/[id]/graph/GraphNode.svelte`: add the `onOpenDetails` prop and call it from `handlePointerUp` when the pointer didn't move enough to count as a drag.

```svelte
// add to props: onOpenDetails: (taskId: number) => void;
```

```svelte
	function handlePointerUp() {
		if (!dragging) return;
		dragging = false;
		if (moved < 4) {
			onOpenDetails(task.id);
			return;
		}
		onDragEnd(task.id, task.x, task.y);
	}
```

(Leave the `onpointerup` on `<g>` that also checks `connectorDragActive` from Task 10 in place — it still calls `handlePointerUp()` first.)

- [ ] **Step 2: Add the details popover to the page**

Modify `src/routes/project/[id]/graph/+page.svelte`: track `selectedTaskId`, compute its screen position with `svgToScreen`, render an absolutely-positioned HTML panel, and PATCH field edits, merging the returned schedule into local state.

```svelte
	import { DEFAULT_VIEWPORT, panViewport, zoomViewportAtPoint, screenToSvg, svgToScreen, type Viewport } from '$lib/graph-viewport';
	// ...

	let selectedTaskId = $state<number | null>(null);
	let selectedTask = $derived(tasks.find((t) => t.id === selectedTaskId) ?? null);
	let popoverPosition = $derived(
		selectedTask && svgEl
			? svgToScreen({ x: selectedTask.x + NODE_SIZE, y: selectedTask.y }, svgEl.getBoundingClientRect(), viewport)
			: null
	);

	function handleOpenDetails(taskId: number) {
		selectedTaskId = taskId;
	}

	async function patchFields(taskId: number, patch: Record<string, unknown>) {
		const response = await fetch(resolve('/project/[id]/graph', { id: String(data.project.id) }), {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'fields', taskId, patch })
		});
		const body = await response.json();
		for (const entry of body.tasks) {
			const t = tasks.find((task) => task.id === entry.id);
			if (t) t.schedule = entry.schedule;
		}
	}

	function handleDescriptionChange(e: Event) {
		if (!selectedTask) return;
		const description = (e.target as HTMLTextAreaElement).value;
		selectedTask.description = description;
		patchFields(selectedTask.id, { description });
	}

	function handleDurationChange(e: Event) {
		if (!selectedTask) return;
		const durationDays = Number((e.target as HTMLInputElement).value);
		selectedTask.durationDays = durationDays;
		patchFields(selectedTask.id, { durationDays });
	}

	function handleStatusChange(e: Event) {
		if (!selectedTask) return;
		const status = (e.target as HTMLSelectElement).value as 'todo' | 'in_progress' | 'done';
		selectedTask.status = status;
		patchFields(selectedTask.id, { status });
	}
```

```svelte
{#if selectedTask && popoverPosition}
	<div class="details-popover" style={`left: ${popoverPosition.x}px; top: ${popoverPosition.y}px;`}>
		<button onclick={() => (selectedTaskId = null)}>Close</button>
		<label>
			Description
			<textarea value={selectedTask.description} onchange={handleDescriptionChange}></textarea>
		</label>
		{#if selectedTask.type === 'task'}
			<label>
				Duration (days)
				<input
					type="number"
					min="0"
					value={selectedTask.durationDays}
					onchange={handleDurationChange}
				/>
			</label>
		{/if}
		<label>
			Status
			<select value={selectedTask.status} onchange={handleStatusChange}>
				<option value="todo">To do</option>
				<option value="in_progress">In progress</option>
				<option value="done">Done</option>
			</select>
		</label>
	</div>
{/if}
```

Pass `onOpenDetails={handleOpenDetails}` to each `GraphNode`, and add to `<style>`:

```svelte
<style>
	/* ...existing styles... */
	.details-popover {
		position: fixed;
		background: white;
		border: 1px solid #ccc;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		z-index: 10;
	}
</style>
```

- [ ] **Step 3: Write the e2e test**

Create `e2e/graph-details-popover.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('editing duration in the popover updates the critical-path highlight without a reload', async ({
	page
}) => {
	const projectName = `E2E Popover ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	// Two independent (unconnected) tasks: CPM gives the longer one zero slack (critical)
	// and the shorter one positive slack (not critical), since each is its own sink node.
	await page.getByPlaceholder('Title').fill('Short branch');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByPlaceholder('Title').fill('Long branch');
	await page.locator('input[name="durationDays"]').fill('5');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('link', { name: 'Graph' }).click();

	const nodes = page.locator('g[data-task-id]');
	// "Long branch" (created second, duration 5) starts as the sole critical-path node.
	await expect(nodes.nth(1).locator('rect.node.critical')).toBeVisible();
	await expect(nodes.first().locator('rect.node.critical')).toHaveCount(0);

	await nodes.first().locator('rect.node').click();
	const durationInput = page.locator('.details-popover input[type="number"]');
	await expect(durationInput).toBeVisible();
	await durationInput.fill('10');
	await durationInput.dispatchEvent('change');

	// "Short branch" is now the longer chain and should become critical, without a page reload.
	await expect(nodes.first().locator('rect.node.critical')).toBeVisible();
	await expect(nodes.nth(1).locator('rect.node.critical')).toHaveCount(0);
});
```

- [ ] **Step 4: Run the e2e test**

Run: `npx playwright test e2e/graph-details-popover.e2e.ts`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all unit and e2e tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/project/[id]/graph e2e/graph-details-popover.e2e.ts
git commit -m "feat: add description/duration/status popover with live schedule updates"
```
