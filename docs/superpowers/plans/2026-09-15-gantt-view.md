# Gantt View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Gantt view — a read-only, CPM-derived timeline of a project's tasks and milestones, rendered with `wx-svelte-gantt`, reachable via a new tab alongside the existing List view.

**Architecture:** A pure TypeScript module (`src/lib/gantt-data.ts`) maps the project/tasks/dependencies data already computed once in `src/routes/project/[id]/+layout.server.ts` (CPM schedule + layer, from earlier plans) into the shapes `wx-svelte-gantt` expects: day-offset schedule fields become calendar `Date`s anchored at `project.startDate`, and our own `schedule.onCriticalPath` flag becomes each task's `critical` field — read by the library's built-in `.wx-critical` bar styling. No new server-side computation and no new database access are needed; the Gantt route reads the same layout data the List view already reads. The library's drag-to-resize/move and edit-form are disabled via its `readonly` prop, since dates are fully CPM-derived (spec: Non-goals).

**Tech Stack:** SvelteKit, TypeScript, `wx-svelte-gantt` (SVAR, MIT license), Vitest, Playwright — all already scaffolded except the new dependency.

**Spec:** `docs/superpowers/specs/2026-09-14-task-graph-app-design.md` (see "Gantt view" section and "Resolved implementation decisions")

## Global Constraints

- No calendar-aware scheduling — CPM counts plain calendar days from `project.start_date` (spec: Non-goals). The Gantt view must not reinterpret these as business days.
- No manual date-dragging in the Gantt view — dates are fully derived from CPM (spec: Non-goals). The Gantt component must be rendered read-only.
- Milestones (`type: 'milestone'`) always have `duration_days = 0` (spec: Data model) — the Gantt view must render them as zero-length markers, never as bars with a computed width.
- Critical-path bars get the same highlight treatment as the Graph/List views (spec: Gantt view) — driven by our own CPM `onCriticalPath` flag, not the library's PRO-only critical-path auto-computation, which this plan does not use.

---

## Task 1: Gantt data mapping

**Files:**

- Create: `src/lib/gantt-data.ts`
- Test: `src/lib/gantt-data.test.ts`

**Interfaces:**

- Consumes: the page data shape `{ project: { startDate: string }, tasks: (Task & { schedule: ScheduleEntry; layer: number })[], dependencies: Dependency[] }` produced by `src/routes/project/[id]/+layout.server.ts` (existing).
- Produces: `GanttTask { id: number; text: string; start: Date; end: Date; type: 'task' | 'milestone'; critical: boolean }`, `GanttLink { id: number; source: number; target: number; type: 'e2s' }`, `toGanttTasks(projectStartDate: string, tasks): GanttTask[]`, `toGanttLinks(dependencies): GanttLink[]` from `$lib/gantt-data` — consumed by Task 2's Gantt page.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/gantt-data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toGanttTasks, toGanttLinks } from './gantt-data';

describe('toGanttTasks', () => {
	it('converts earliest-start/finish day offsets into calendar dates from the project start date', () => {
		const tasks = [
			{
				id: 1,
				title: 'Buy bread',
				type: 'task' as const,
				schedule: { earliestStart: 2, earliestFinish: 5, onCriticalPath: false }
			}
		];
		const [ganttTask] = toGanttTasks('2026-01-01', tasks);
		expect(ganttTask.start.toISOString().slice(0, 10)).toBe('2026-01-03');
		expect(ganttTask.end.toISOString().slice(0, 10)).toBe('2026-01-06');
	});

	it('gives a milestone a zero-length span when earliest start equals earliest finish', () => {
		const tasks = [
			{
				id: 2,
				title: 'Loaf ready',
				type: 'milestone' as const,
				schedule: { earliestStart: 3, earliestFinish: 3, onCriticalPath: true }
			}
		];
		const [ganttTask] = toGanttTasks('2026-01-01', tasks);
		expect(ganttTask.start.getTime()).toBe(ganttTask.end.getTime());
	});

	it('marks a task critical exactly when its schedule is on the critical path', () => {
		const tasks = [
			{
				id: 1,
				title: 'Buy bread',
				type: 'task' as const,
				schedule: { earliestStart: 0, earliestFinish: 1, onCriticalPath: true }
			},
			{
				id: 2,
				title: 'Side errand',
				type: 'task' as const,
				schedule: { earliestStart: 0, earliestFinish: 1, onCriticalPath: false }
			}
		];
		const [critical, notCritical] = toGanttTasks('2026-01-01', tasks);
		expect(critical.critical).toBe(true);
		expect(notCritical.critical).toBe(false);
	});

	it('passes through the task id, title, and type', () => {
		const tasks = [
			{
				id: 42,
				title: 'Spread peanut butter',
				type: 'task' as const,
				schedule: { earliestStart: 0, earliestFinish: 1, onCriticalPath: false }
			}
		];
		const [ganttTask] = toGanttTasks('2026-01-01', tasks);
		expect(ganttTask.id).toBe(42);
		expect(ganttTask.text).toBe('Spread peanut butter');
		expect(ganttTask.type).toBe('task');
	});
});

describe('toGanttLinks', () => {
	it('maps dependency edges to finish-to-start links using predecessor/successor ids', () => {
		const dependencies = [{ id: 7, predecessorId: 1, successorId: 2 }];
		expect(toGanttLinks(dependencies)).toEqual([{ id: 7, source: 1, target: 2, type: 'e2s' }]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/gantt-data.test.ts`
Expected: FAIL with "Cannot find module './gantt-data'".

- [ ] **Step 3: Implement**

Create `src/lib/gantt-data.ts`:

```ts
export interface GanttTask {
	id: number;
	text: string;
	start: Date;
	end: Date;
	type: 'task' | 'milestone';
	critical: boolean;
}

export interface GanttLink {
	id: number;
	source: number;
	target: number;
	type: 'e2s';
}

interface ScheduledTaskInput {
	id: number;
	title: string;
	type: 'task' | 'milestone';
	schedule: {
		earliestStart: number;
		earliestFinish: number;
		onCriticalPath: boolean;
	};
}

interface DependencyEdgeInput {
	id: number;
	predecessorId: number;
	successorId: number;
}

function addDays(isoDate: string, days: number): Date {
	const date = new Date(`${isoDate}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date;
}

export function toGanttTasks(projectStartDate: string, tasks: ScheduledTaskInput[]): GanttTask[] {
	return tasks.map((task) => ({
		id: task.id,
		text: task.title,
		start: addDays(projectStartDate, task.schedule.earliestStart),
		end: addDays(projectStartDate, task.schedule.earliestFinish),
		type: task.type,
		critical: task.schedule.onCriticalPath
	}));
}

export function toGanttLinks(dependencies: DependencyEdgeInput[]): GanttLink[] {
	return dependencies.map((dependency) => ({
		id: dependency.id,
		source: dependency.predecessorId,
		target: dependency.successorId,
		type: 'e2s'
	}));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/gantt-data.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gantt-data.ts src/lib/gantt-data.test.ts
git commit -m "feat: add Gantt data mapping from CPM schedule to calendar dates"
```

---

## Task 2: Gantt route, navigation tabs, and e2e coverage

> **Correction (discovered during implementation, ruling recorded in this plan's SDD ledger):**
> The originally planned `criticalPath={{ type: 'strict' }}` config prop does nothing in the
> installed free/MIT `wx-svelte-gantt` build — `@svar-ui/gantt-store`'s `DataStore.init()`
> unconditionally resets `criticalPath` to `null` on every call, because "Critical path" is a
> PRO-only feature there. The `.wx-critical` class this plan originally relied on can never be
> applied through the public config API. Instead, this task renders bars/milestones through the
> library's `taskTemplate` prop — a documented, non-PRO-gated customization point — with our own
> component applying the same crimson-outline highlight the List view already uses
> (`src/routes/project/[id]/list/+page.svelte`'s `.critical` rule), driven directly by our own
> `GanttTask.critical` field from Task 1.

**Files:**

- Modify: `package.json` (new dependency)
- Modify: `src/routes/project/[id]/+layout.svelte`
- Create: `src/lib/components/GanttTaskBar.svelte`
- Create: `src/routes/project/[id]/gantt/+page.svelte`
- Test: `e2e/gantt-view.e2e.ts`

**Interfaces:**

- Consumes: `toGanttTasks`, `toGanttLinks`, `GanttTask`, `GanttLink` (Task 1); page data `{ project, tasks, dependencies }` from `src/routes/project/[id]/+layout.server.ts` (existing, inherited by every route nested under `/project/[id]`); `Gantt`, `Willow` components from `wx-svelte-gantt`.
- Produces: `GanttTaskBar` Svelte component from `$lib/components/GanttTaskBar.svelte`, passed as the Gantt component's `taskTemplate` prop.

- [ ] **Step 1: Install the Gantt library**

Run: `npm install wx-svelte-gantt`

- [ ] **Step 2: Add List/Gantt tabs to the project layout**

Replace `src/routes/project/[id]/+layout.svelte`:

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';

	let { data, children } = $props();
</script>

<p><a href={resolve('/')}>&larr; All projects</a></p>
<h1>{data.project.name}</h1>

<nav>
	<a href={resolve('/project/[id]/list', { id: String(data.project.id) })}>List</a>
	<a href={resolve('/project/[id]/gantt', { id: String(data.project.id) })}>Gantt</a>
</nav>

{@render children()}
```

- [ ] **Step 3: Write the custom bar/milestone template**

Create `src/lib/components/GanttTaskBar.svelte`. This is passed as the Gantt component's
`taskTemplate` prop; it renders our own bar (task) or diamond (milestone) content instead of the
library's default, so critical-path highlighting can be driven by our own `critical` field
instead of the PRO-gated `criticalPath` config:

```svelte
<script lang="ts">
	let { data }: { data: { text?: string; type?: string; critical?: boolean } } = $props();
</script>

{#if data.type === 'milestone'}
	<div class="milestone" class:critical={data.critical}></div>
	<div class="label">{data.text ?? ''}</div>
{:else}
	<div class="bar" class:critical={data.critical}>{data.text ?? ''}</div>
{/if}

<style>
	.bar {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--wx-gantt-task-font-color, #fff);
		background-color: var(--wx-gantt-task-color, #3983eb);
	}
	.bar.critical {
		outline: 2px solid crimson;
	}
	.milestone {
		position: absolute;
		inset: 0;
		z-index: 3;
		background-color: var(--wx-gantt-milestone-color, #ad44ab);
		transform: rotate(45deg) scale(0.75);
		border-radius: 3px;
	}
	.milestone.critical {
		outline: 2px solid crimson;
	}
	.label {
		position: absolute;
		left: 100%;
		padding: 0 4px;
		white-space: nowrap;
	}
</style>
```

- [ ] **Step 4: Write the Gantt page**

Create `src/routes/project/[id]/gantt/+page.svelte`:

```svelte
<script lang="ts">
	import { Gantt, Willow } from 'wx-svelte-gantt';
	import { toGanttTasks, toGanttLinks } from '$lib/gantt-data';
	import GanttTaskBar from '$lib/components/GanttTaskBar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let tasks = $derived(toGanttTasks(data.project.startDate, data.tasks));
	let links = $derived(toGanttLinks(data.dependencies));
</script>

<h2>Gantt</h2>

<div class="gantt-container">
	<Willow>
		<Gantt {tasks} {links} readonly taskTemplate={GanttTaskBar} />
	</Willow>
</div>

<style>
	.gantt-container {
		height: 600px;
	}
</style>
```

- [ ] **Step 5: Run the app and manually verify the Gantt tab renders**

Run: `npm run build && npm run preview`, then open `http://localhost:4173/`, create a project, add a task on the List tab, then click the "Gantt" tab.
Expected: the Gantt tab loads without console errors and shows one bar for the task.

- [ ] **Step 6: Write the e2e test**

Create `e2e/gantt-view.e2e.ts`. Each "Add"/"Add dependency" click waits for its result to appear
before the next step — the same pattern `e2e/list-view.e2e.ts` already uses — since these forms
submit via `use:enhance` and the newly created row/option isn't in the DOM synchronously:

```ts
import { expect, test } from '@playwright/test';

test('shows dependent tasks and a milestone on the Gantt timeline with critical-path highlighting', async ({
	page
}) => {
	const projectName = `E2E Gantt ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Buy bread');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Buy bread' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('Spread peanut butter');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Spread peanut butter' })).toBeVisible();

	const predecessorSelect = page.locator('select[name="predecessorId"]');
	const successorSelect = page.locator('select[name="successorId"]');
	await predecessorSelect.selectOption({ label: 'Buy bread' });
	await successorSelect.selectOption({ label: 'Spread peanut butter' });
	await page.getByRole('button', { name: 'Add dependency' }).click();
	await expect(
		page.locator('li').filter({ hasText: 'Buy bread → Spread peanut butter' })
	).toBeVisible();

	await page.getByPlaceholder('Title').fill('Sandwich ready');
	await page.locator('select[name="type"]').selectOption('milestone');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Sandwich ready' })).toBeVisible();

	await predecessorSelect.selectOption({ label: 'Spread peanut butter' });
	await successorSelect.selectOption({ label: 'Sandwich ready' });
	await page.getByRole('button', { name: 'Add dependency' }).click();
	await expect(
		page.locator('li').filter({ hasText: 'Spread peanut butter → Sandwich ready' })
	).toBeVisible();

	await page.getByRole('link', { name: 'Gantt' }).click();
	await expect(page.locator('h2', { hasText: 'Gantt' })).toBeVisible();

	// The only path through the graph, so both tasks and the milestone are critical.
	const breadBar = page.locator('.wx-bar.wx-task').filter({ hasText: 'Buy bread' });
	await expect(breadBar.locator('.critical')).toHaveCount(1);
	const spreadBar = page.locator('.wx-bar.wx-task').filter({ hasText: 'Spread peanut butter' });
	await expect(spreadBar.locator('.critical')).toHaveCount(1);

	const milestoneBar = page.locator('.wx-bar.wx-milestone');
	await expect(milestoneBar.locator('.critical')).toHaveCount(1);
	await expect(page.locator('.label', { hasText: 'Sandwich ready' })).toBeVisible();

	// No date-dragging: the readonly Gantt renders no progress marker or link-creation handles.
	await expect(page.locator('.wx-progress-marker')).toHaveCount(0);
});
```

- [ ] **Step 7: Run the e2e test**

Run: `npx playwright test e2e/gantt-view.e2e.ts`
Expected: PASS.

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: all unit and e2e tests PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/lib/components src/routes/project e2e/gantt-view.e2e.ts
git commit -m "feat: add the Gantt view"
```
