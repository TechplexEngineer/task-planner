# Task Graph Foundation + List View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Cloudflare D1 + SvelteKit foundation (schema, migrations, CPM scheduling engine) and ship a fully working List view — the first of the app's three synchronized views — with project management, task/dependency CRUD, milestone support, drag-reorder priority, and critical-path/order-violation surfacing.

**Architecture:** SvelteKit server routes (`load`/form actions) talk to Cloudflare D1 via Drizzle ORM, running locally through `@cloudflare/vite-plugin` (no separate `wrangler dev` process needed — `npm run dev`/`npm run preview` run inside a real Workers runtime with the D1 binding live). Critical-path and dependency-order logic are pure, D1-agnostic TypeScript modules, unit tested directly. The Graph view and Gantt view are separate follow-up plans; this plan's UI surface is the List view only, reached via a project switcher.

**Tech Stack:** SvelteKit, TypeScript, Cloudflare D1, Drizzle ORM (`drizzle-orm/d1`, `drizzle-kit`), `@sveltejs/adapter-cloudflare`, `@cloudflare/vite-plugin`, `svelte-dnd-action`, Vitest (already scaffolded), Playwright (already scaffolded).

**Spec:** `docs/superpowers/specs/2026-09-14-task-graph-app-design.md`

## Global Constraints

- Single user, no auth — every route assumes one local user (spec: Scope).
- No calendar-aware scheduling — CPM counts plain calendar days from `project.start_date` (spec: Non-goals).
- Every dependency-graph edge write must run cycle detection first and be rejected if it would create a cycle (spec: Data model).
- Milestones (`type: 'milestone'`) always have `duration_days = 0` (spec: Data model).
- List view ordering is manual drag order with non-blocking dependency-order warnings, never auto-computed (spec: List view).
- This plan produces the List view only — Graph view and Gantt view are out of scope here (spec's Graph/Gantt sections are implemented by later plans).

---

## Task 1: Cloudflare D1 project scaffolding

**Files:**

- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/app.d.ts`
- Create: `wrangler.jsonc`

**Interfaces:**

- Produces: `App.Platform.env.DB: D1Database`, available to every server `load`/action/`+server.ts` via `event.platform.env.DB`.

- [ ] **Step 1: Install dependencies**

```bash
npm install drizzle-orm
npm install -D @sveltejs/adapter-cloudflare @cloudflare/vite-plugin wrangler drizzle-kit @cloudflare/workers-types
```

- [ ] **Step 2: Swap the adapter and add the Cloudflare Vite plugin**

In `vite.config.ts`, replace the `adapter-auto` import and add the Cloudflare plugin ahead of `sveltekit()`:

```ts
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { cloudflare } from '@cloudflare/vite-plugin';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		cloudflare(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
```

- [ ] **Step 3: Declare the D1 binding type**

Replace `src/app.d.ts` with:

```ts
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
			};
		}
	}
}

export {};
```

- [ ] **Step 4: Create the Wrangler config**

Create `wrangler.jsonc`:

```jsonc
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "task-graph",
	"compatibility_date": "2026-09-01",
	"main": ".svelte-kit/cloudflare/_worker.js",
	"assets": {
		"directory": ".svelte-kit/cloudflare",
		"binding": "ASSETS"
	},
	"d1_databases": [
		{
			"binding": "DB",
			"database_name": "task-graph-db",
			"database_id": "00000000-0000-0000-0000-000000000000",
			"migrations_dir": "migrations"
		}
	]
}
```

- [ ] **Step 5: Verify the D1 binding is live in dev and preview**

Create a temporary route `src/routes/db-check/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	const result = await platform?.env.DB.prepare('SELECT 1 as ok').first();
	return json({ result });
};
```

Run: `npm run dev`, then in another terminal: `curl http://localhost:5173/db-check`
Expected: `{"result":{"ok":1}}`

Stop dev, then run: `npm run build && npm run preview`, then: `curl http://localhost:4173/db-check`
Expected: `{"result":{"ok":1}}` — this confirms the binding also works in the mode Playwright's `webServer` uses later in this plan.

If either check fails with a binding/config error, adjust `wrangler.jsonc` or the plugin config per the error message before continuing — don't proceed with a broken binding.

Delete `src/routes/db-check/` once both checks pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/app.d.ts wrangler.jsonc
git commit -m "chore: scaffold Cloudflare D1 binding via adapter-cloudflare and vite-plugin"
```

---

## Task 2: Drizzle schema and D1 migrations

**Files:**

- Create: `src/lib/server/db/schema.ts`
- Create: `src/lib/server/db/client.ts`
- Create: `drizzle.config.ts`
- Modify: `package.json` (scripts)
- Create: `migrations/` (generated)

**Interfaces:**

- Consumes: `App.Platform.env.DB: D1Database` (Task 1).
- Produces: `getDb(d1: D1Database): Db` and exported tables `projects`, `tasks`, `dependencies`, `taskPositions` from `$lib/server/db/schema`, used by every repository in later tasks.

- [ ] **Step 1: Write the schema**

Create `src/lib/server/db/schema.ts`:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	startDate: text('start_date').notNull(),
	createdAt: text('created_at').notNull()
});

export const tasks = sqliteTable('tasks', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	projectId: integer('project_id')
		.notNull()
		.references(() => projects.id),
	title: text('title').notNull(),
	description: text('description').notNull().default(''),
	type: text('type', { enum: ['task', 'milestone'] })
		.notNull()
		.default('task'),
	durationDays: integer('duration_days').notNull().default(1),
	status: text('status', { enum: ['todo', 'in_progress', 'done'] })
		.notNull()
		.default('todo'),
	priorityRank: integer('priority_rank').notNull(),
	createdAt: text('created_at').notNull()
});

export const dependencies = sqliteTable('dependencies', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	projectId: integer('project_id')
		.notNull()
		.references(() => projects.id),
	predecessorId: integer('predecessor_id')
		.notNull()
		.references(() => tasks.id),
	successorId: integer('successor_id')
		.notNull()
		.references(() => tasks.id)
});

export const taskPositions = sqliteTable('task_positions', {
	taskId: integer('task_id')
		.primaryKey()
		.references(() => tasks.id),
	offsetX: integer('offset_x').notNull().default(0),
	offsetY: integer('offset_y').notNull().default(0)
});
```

- [ ] **Step 2: Write the DB client helper**

Create `src/lib/server/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getDb(d1: D1Database) {
	return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof getDb>;
```

- [ ] **Step 3: Write the Drizzle Kit config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/lib/server/db/schema.ts',
	out: './migrations'
});
```

- [ ] **Step 4: Add db scripts to package.json**

In `package.json` `scripts`, add:

```json
"db:generate": "drizzle-kit generate",
"db:migrate:local": "wrangler d1 migrations apply DB --local"
```

- [ ] **Step 5: Generate and apply the migration**

Run: `npm run db:generate`
Expected: a new file under `migrations/0000_*.sql` containing `CREATE TABLE` statements for `projects`, `tasks`, `dependencies`, `task_positions`.

Run: `npm run db:migrate:local`
Expected: output confirms the migration was applied to the local D1 database.

- [ ] **Step 6: Verify the tables exist**

Run: `npx wrangler d1 execute DB --local --command "SELECT name FROM sqlite_master WHERE type='table'"`
Expected: output lists `projects`, `tasks`, `dependencies`, `task_positions` (plus Wrangler's own `d1_migrations` table).

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/db package.json drizzle.config.ts migrations
git commit -m "feat: add Drizzle schema and D1 migrations"
```

---

## Task 3: Cycle detection

**Files:**

- Create: `src/lib/server/scheduling/types.ts`
- Create: `src/lib/server/scheduling/cycle-detection.ts`
- Test: `src/lib/server/scheduling/cycle-detection.test.ts`

**Interfaces:**

- Produces: `SchedulingEdge { predecessorId: number; successorId: number }` (shared by Tasks 4 and 5); `wouldCreateCycle(existingEdges: SchedulingEdge[], newEdge: SchedulingEdge): boolean`, used by `dependencies` repository in Task 7.

- [ ] **Step 1: Write the shared types**

Create `src/lib/server/scheduling/types.ts`:

```ts
export interface SchedulingEdge {
	predecessorId: number;
	successorId: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/server/scheduling/cycle-detection.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { wouldCreateCycle } from './cycle-detection';

describe('wouldCreateCycle', () => {
	it('returns false for a new edge with no existing path back', () => {
		const existing = [{ predecessorId: 1, successorId: 2 }];
		expect(wouldCreateCycle(existing, { predecessorId: 2, successorId: 3 })).toBe(false);
	});

	it('returns true when the new edge closes a direct cycle', () => {
		const existing = [{ predecessorId: 1, successorId: 2 }];
		expect(wouldCreateCycle(existing, { predecessorId: 2, successorId: 1 })).toBe(true);
	});

	it('returns true when the new edge closes an indirect cycle', () => {
		const existing = [
			{ predecessorId: 1, successorId: 2 },
			{ predecessorId: 2, successorId: 3 }
		];
		expect(wouldCreateCycle(existing, { predecessorId: 3, successorId: 1 })).toBe(true);
	});

	it('returns true for a self-loop', () => {
		expect(wouldCreateCycle([], { predecessorId: 1, successorId: 1 })).toBe(true);
	});

	it('returns false for an edge disjoint from all existing edges', () => {
		const existing = [{ predecessorId: 1, successorId: 2 }];
		expect(wouldCreateCycle(existing, { predecessorId: 5, successorId: 6 })).toBe(false);
	});
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/scheduling/cycle-detection.test.ts`
Expected: FAIL with "Cannot find module './cycle-detection'" or similar.

- [ ] **Step 4: Implement**

Create `src/lib/server/scheduling/cycle-detection.ts`:

```ts
import type { SchedulingEdge } from './types';

export function wouldCreateCycle(
	existingEdges: SchedulingEdge[],
	newEdge: SchedulingEdge
): boolean {
	if (newEdge.predecessorId === newEdge.successorId) return true;

	const successorsOf = new Map<number, number[]>();
	for (const edge of existingEdges) {
		const successors = successorsOf.get(edge.predecessorId) ?? [];
		successors.push(edge.successorId);
		successorsOf.set(edge.predecessorId, successors);
	}

	const visited = new Set<number>();
	function canReach(from: number, target: number): boolean {
		if (from === target) return true;
		if (visited.has(from)) return false;
		visited.add(from);
		for (const next of successorsOf.get(from) ?? []) {
			if (canReach(next, target)) return true;
		}
		return false;
	}

	return canReach(newEdge.successorId, newEdge.predecessorId);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/scheduling/cycle-detection.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/scheduling/types.ts src/lib/server/scheduling/cycle-detection.ts src/lib/server/scheduling/cycle-detection.test.ts
git commit -m "feat: add dependency cycle detection"
```

---

## Task 4: Layer assignment (graph auto-layout columns)

**Files:**

- Create: `src/lib/server/scheduling/layout.ts`
- Test: `src/lib/server/scheduling/layout.test.ts`

**Interfaces:**

- Consumes: `SchedulingEdge` (Task 3).
- Produces: `computeLayers(taskIds: number[], edges: SchedulingEdge[]): Map<number, number>`, used by `+layout.server.ts` in Task 7 and by the Graph view in a later plan.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/scheduling/layout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeLayers } from './layout';

describe('computeLayers', () => {
	it('puts every task in layer 0 when there are no edges', () => {
		const layers = computeLayers([1, 2, 3], []);
		expect(layers.get(1)).toBe(0);
		expect(layers.get(2)).toBe(0);
		expect(layers.get(3)).toBe(0);
	});

	it('assigns increasing layers along a chain', () => {
		const layers = computeLayers(
			[1, 2, 3],
			[
				{ predecessorId: 1, successorId: 2 },
				{ predecessorId: 2, successorId: 3 }
			]
		);
		expect(layers.get(1)).toBe(0);
		expect(layers.get(2)).toBe(1);
		expect(layers.get(3)).toBe(2);
	});

	it('uses the longest incoming path for a diamond shape', () => {
		const layers = computeLayers(
			[1, 2, 3, 4],
			[
				{ predecessorId: 1, successorId: 2 },
				{ predecessorId: 1, successorId: 3 },
				{ predecessorId: 2, successorId: 4 },
				{ predecessorId: 3, successorId: 4 }
			]
		);
		expect(layers.get(1)).toBe(0);
		expect(layers.get(2)).toBe(1);
		expect(layers.get(3)).toBe(1);
		expect(layers.get(4)).toBe(2);
	});

	it('leaves a disconnected task at layer 0', () => {
		const layers = computeLayers([1, 2, 99], [{ predecessorId: 1, successorId: 2 }]);
		expect(layers.get(99)).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/scheduling/layout.test.ts`
Expected: FAIL with "Cannot find module './layout'".

- [ ] **Step 3: Implement**

Create `src/lib/server/scheduling/layout.ts`:

```ts
import type { SchedulingEdge } from './types';

export function computeLayers(taskIds: number[], edges: SchedulingEdge[]): Map<number, number> {
	const predecessorsOf = new Map<number, number[]>();
	for (const id of taskIds) predecessorsOf.set(id, []);
	for (const edge of edges) {
		predecessorsOf.get(edge.successorId)?.push(edge.predecessorId);
	}

	const layers = new Map<number, number>();

	function layerOf(id: number): number {
		if (layers.has(id)) return layers.get(id)!;
		const preds = predecessorsOf.get(id) ?? [];
		const layer = preds.length === 0 ? 0 : Math.max(...preds.map(layerOf)) + 1;
		layers.set(id, layer);
		return layer;
	}

	for (const id of taskIds) layerOf(id);
	return layers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/scheduling/layout.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/scheduling/layout.ts src/lib/server/scheduling/layout.test.ts
git commit -m "feat: add dependency layer assignment for graph auto-layout"
```

---

## Task 5: CPM scheduling (critical path, slack, milestones)

**Files:**

- Create: `src/lib/server/scheduling/cpm.ts`
- Test: `src/lib/server/scheduling/cpm.test.ts`

**Interfaces:**

- Consumes: `SchedulingEdge` (Task 3).
- Produces: `SchedulingTask { id: number; durationDays: number }`, `ScheduleEntry { earliestStart, earliestFinish, latestStart, latestFinish, slack, onCriticalPath }`, `computeSchedule(tasks: SchedulingTask[], edges: SchedulingEdge[]): Map<number, ScheduleEntry>` — used by `+layout.server.ts` in Task 7 and by the Gantt view in a later plan.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/scheduling/cpm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeSchedule } from './cpm';

describe('computeSchedule', () => {
	it('schedules a single task starting at day 0', () => {
		const schedule = computeSchedule([{ id: 1, durationDays: 3 }], []);
		expect(schedule.get(1)).toEqual({
			earliestStart: 0,
			earliestFinish: 3,
			latestStart: 0,
			latestFinish: 3,
			slack: 0,
			onCriticalPath: true
		});
	});

	it('chains tasks back to back with zero slack throughout', () => {
		const schedule = computeSchedule(
			[
				{ id: 1, durationDays: 2 },
				{ id: 2, durationDays: 3 },
				{ id: 3, durationDays: 1 }
			],
			[
				{ predecessorId: 1, successorId: 2 },
				{ predecessorId: 2, successorId: 3 }
			]
		);
		expect(schedule.get(1)?.earliestStart).toBe(0);
		expect(schedule.get(2)?.earliestStart).toBe(2);
		expect(schedule.get(3)?.earliestStart).toBe(5);
		expect(schedule.get(3)?.earliestFinish).toBe(6);
		expect(schedule.get(1)?.onCriticalPath).toBe(true);
		expect(schedule.get(2)?.onCriticalPath).toBe(true);
		expect(schedule.get(3)?.onCriticalPath).toBe(true);
	});

	it('gives the shorter parallel branch positive slack and the longer branch zero slack', () => {
		const schedule = computeSchedule(
			[
				{ id: 1, durationDays: 1 },
				{ id: 2, durationDays: 1 },
				{ id: 3, durationDays: 5 }
			],
			[
				{ predecessorId: 1, successorId: 2 },
				{ predecessorId: 1, successorId: 3 }
			]
		);
		expect(schedule.get(2)?.slack).toBe(4);
		expect(schedule.get(2)?.onCriticalPath).toBe(false);
		expect(schedule.get(3)?.slack).toBe(0);
		expect(schedule.get(3)?.onCriticalPath).toBe(true);
	});

	it('schedules a zero-duration milestone right after its predecessor finishes', () => {
		const schedule = computeSchedule(
			[
				{ id: 1, durationDays: 2 },
				{ id: 2, durationDays: 0 }
			],
			[{ predecessorId: 1, successorId: 2 }]
		);
		expect(schedule.get(2)?.earliestStart).toBe(2);
		expect(schedule.get(2)?.earliestFinish).toBe(2);
		expect(schedule.get(2)?.onCriticalPath).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/server/scheduling/cpm.test.ts`
Expected: FAIL with "Cannot find module './cpm'".

- [ ] **Step 3: Implement**

Create `src/lib/server/scheduling/cpm.ts`:

```ts
import type { SchedulingEdge } from './types';

export interface SchedulingTask {
	id: number;
	durationDays: number;
}

export interface ScheduleEntry {
	earliestStart: number;
	earliestFinish: number;
	latestStart: number;
	latestFinish: number;
	slack: number;
	onCriticalPath: boolean;
}

export function computeSchedule(
	tasks: SchedulingTask[],
	edges: SchedulingEdge[]
): Map<number, ScheduleEntry> {
	const durationOf = new Map(tasks.map((t) => [t.id, t.durationDays]));
	const predecessorsOf = new Map<number, number[]>();
	const successorsOf = new Map<number, number[]>();
	for (const task of tasks) {
		predecessorsOf.set(task.id, []);
		successorsOf.set(task.id, []);
	}
	for (const edge of edges) {
		predecessorsOf.get(edge.successorId)?.push(edge.predecessorId);
		successorsOf.get(edge.predecessorId)?.push(edge.successorId);
	}

	const earliestStart = new Map<number, number>();
	const earliestFinish = new Map<number, number>();

	function computeEarliest(id: number): number {
		if (earliestFinish.has(id)) return earliestFinish.get(id)!;
		const preds = predecessorsOf.get(id) ?? [];
		const start = preds.length === 0 ? 0 : Math.max(...preds.map(computeEarliest));
		const finish = start + (durationOf.get(id) ?? 0);
		earliestStart.set(id, start);
		earliestFinish.set(id, finish);
		return finish;
	}

	for (const task of tasks) computeEarliest(task.id);

	const projectFinish = Math.max(0, ...[...earliestFinish.values()]);

	const latestStart = new Map<number, number>();
	const latestFinish = new Map<number, number>();

	function computeLatest(id: number): number {
		if (latestStart.has(id)) return latestStart.get(id)!;
		const succs = successorsOf.get(id) ?? [];
		const finish = succs.length === 0 ? projectFinish : Math.min(...succs.map(computeLatest));
		const start = finish - (durationOf.get(id) ?? 0);
		latestFinish.set(id, finish);
		latestStart.set(id, start);
		return start;
	}

	for (const task of tasks) computeLatest(task.id);

	const result = new Map<number, ScheduleEntry>();
	for (const task of tasks) {
		const es = earliestStart.get(task.id)!;
		const ef = earliestFinish.get(task.id)!;
		const ls = latestStart.get(task.id)!;
		const lf = latestFinish.get(task.id)!;
		const slack = ls - es;
		result.set(task.id, {
			earliestStart: es,
			earliestFinish: ef,
			latestStart: ls,
			latestFinish: lf,
			slack,
			onCriticalPath: slack === 0
		});
	}
	return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/server/scheduling/cpm.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/scheduling/cpm.ts src/lib/server/scheduling/cpm.test.ts
git commit -m "feat: add CPM scheduling with critical path and slack"
```

---

## Task 6: Project repository and project switcher

**Files:**

- Create: `src/lib/server/repositories/projects.ts`
- Modify: `src/routes/+page.server.ts` (new file)
- Modify: `src/routes/+page.svelte`
- Test: `e2e/project-switcher.e2e.ts`

**Interfaces:**

- Consumes: `getDb`, `Db`, `projects`/`tasks`/`dependencies`/`taskPositions` tables (Task 2).
- Produces: `listProjects(db)`, `createProject(db, name)`, `renameProject(db, id, name)`, `deleteProject(db, id)`, `getProject(db, id)` from `$lib/server/repositories/projects` — `getProject` is consumed by Task 7's layout load.

- [ ] **Step 1: Write the project repository**

Create `src/lib/server/repositories/projects.ts`:

```ts
import { eq, inArray } from 'drizzle-orm';
import { projects, tasks, dependencies, taskPositions } from '../db/schema';
import type { Db } from '../db/client';

export async function listProjects(db: Db) {
	return db.select().from(projects).all();
}

export async function getProject(db: Db, id: number) {
	return db.select().from(projects).where(eq(projects.id, id)).get();
}

export async function createProject(db: Db, name: string) {
	const startDate = new Date().toISOString().slice(0, 10);
	const createdAt = new Date().toISOString();
	const [project] = await db.insert(projects).values({ name, startDate, createdAt }).returning();
	return project;
}

export async function renameProject(db: Db, id: number, name: string) {
	await db.update(projects).set({ name }).where(eq(projects.id, id));
}

export async function deleteProject(db: Db, id: number) {
	const projectTasks = await db
		.select({ id: tasks.id })
		.from(tasks)
		.where(eq(tasks.projectId, id))
		.all();
	const taskIds = projectTasks.map((t) => t.id);

	await db.delete(dependencies).where(eq(dependencies.projectId, id));
	if (taskIds.length > 0) {
		await db.delete(taskPositions).where(inArray(taskPositions.taskId, taskIds));
	}
	await db.delete(tasks).where(eq(tasks.projectId, id));
	await db.delete(projects).where(eq(projects.id, id));
}
```

- [ ] **Step 2: Write the project switcher server load and actions**

Create `src/routes/+page.server.ts`:

```ts
import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import {
	createProject,
	deleteProject,
	listProjects,
	renameProject
} from '$lib/server/repositories/projects';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform!.env.DB);
	const projects = await listProjects(db);
	return { projects };
};

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const name = data.get('name');
		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { error: 'Project name is required' });
		}
		await createProject(db, name.trim());
	},
	rename: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const id = Number(data.get('id'));
		const name = data.get('name');
		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { error: 'Project name is required' });
		}
		await renameProject(db, id, name.trim());
	},
	delete: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const id = Number(data.get('id'));
		await deleteProject(db, id);
	}
};
```

- [ ] **Step 3: Write the project switcher UI**

Replace `src/routes/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1>Projects</h1>

<ul>
	{#each data.projects as project (project.id)}
		<li>
			<a href={`/project/${project.id}/list`}>{project.name}</a>
			<form method="POST" action="?/rename" use:enhance>
				<input type="hidden" name="id" value={project.id} />
				<input type="text" name="name" value={project.name} aria-label="Rename project" />
				<button type="submit">Rename</button>
			</form>
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={project.id} />
				<button type="submit">Delete</button>
			</form>
		</li>
	{/each}
</ul>

<form method="POST" action="?/create" use:enhance>
	<input
		type="text"
		name="name"
		placeholder="New project name"
		aria-label="New project name"
		required
	/>
	<button type="submit">Create project</button>
</form>
```

- [ ] **Step 4: Write the e2e test**

Create `e2e/project-switcher.e2e.ts` (unique name per run avoids collisions with data left by earlier runs; the test cleans up after itself):

```ts
import { expect, test } from '@playwright/test';

test('create, rename, and delete a project', async ({ page }) => {
	const originalName = `E2E Project ${Date.now()}`;
	const renamedName = `${originalName} Renamed`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(originalName);
	await page.getByRole('button', { name: 'Create project' }).click();

	const row = page.locator('li').filter({ hasText: originalName });
	await expect(row).toBeVisible();

	await row.getByLabel('Rename project').fill(renamedName);
	await row.getByRole('button', { name: 'Rename' }).click();
	await expect(page.locator('li').filter({ hasText: renamedName })).toBeVisible();

	await page
		.locator('li')
		.filter({ hasText: renamedName })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page.locator('li').filter({ hasText: renamedName })).not.toBeVisible();
});
```

- [ ] **Step 5: Run the e2e test**

Run: `npx playwright test e2e/project-switcher.e2e.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/repositories/projects.ts src/routes/+page.server.ts src/routes/+page.svelte e2e/project-switcher.e2e.ts
git commit -m "feat: add project repository and project switcher"
```

---

## Task 7: Task and dependency CRUD — List view

**Files:**

- Create: `src/lib/server/repositories/tasks.ts`
- Create: `src/lib/server/repositories/dependencies.ts`
- Create: `src/routes/project/[id]/+layout.server.ts`
- Create: `src/routes/project/[id]/+layout.svelte`
- Create: `src/routes/project/[id]/list/+page.server.ts`
- Create: `src/routes/project/[id]/list/+page.svelte`
- Test: `e2e/list-view.e2e.ts`

**Interfaces:**

- Consumes: `getDb`, `Db`, schema tables (Task 2); `wouldCreateCycle`, `SchedulingEdge` (Task 3); `computeLayers` (Task 4); `computeSchedule`, `SchedulingTask`, `ScheduleEntry` (Task 5); `getProject` (Task 6).
- Produces: `listTasksForProject`, `createTask`, `updateTask`, `deleteTask`, `reorderTasks` from `$lib/server/repositories/tasks`; `listDependenciesForProject`, `createDependency`, `deleteDependency`, `CycleError` from `$lib/server/repositories/dependencies`; page data shape `{ project, tasks: (Task & { schedule: ScheduleEntry; layer: number })[], dependencies: Dependency[] }` from `/project/[id]` layout, consumed by Task 8 and by the Graph/Gantt views in later plans.

- [ ] **Step 1: Write the task repository**

Create `src/lib/server/repositories/tasks.ts`:

```ts
import { eq, or } from 'drizzle-orm';
import { tasks, dependencies, taskPositions } from '../db/schema';
import type { Db } from '../db/client';

export interface NewTaskInput {
	projectId: number;
	title: string;
	description: string;
	type: 'task' | 'milestone';
	durationDays: number;
}

export interface TaskPatch {
	title?: string;
	description?: string;
	type?: 'task' | 'milestone';
	durationDays?: number;
	status?: 'todo' | 'in_progress' | 'done';
}

export async function listTasksForProject(db: Db, projectId: number) {
	return db.select().from(tasks).where(eq(tasks.projectId, projectId)).all();
}

export async function createTask(db: Db, input: NewTaskInput) {
	const existing = await listTasksForProject(db, input.projectId);
	const nextRank = existing.length === 0 ? 1 : Math.max(...existing.map((t) => t.priorityRank)) + 1;
	const createdAt = new Date().toISOString();
	const durationDays = input.type === 'milestone' ? 0 : input.durationDays;
	const [task] = await db
		.insert(tasks)
		.values({
			projectId: input.projectId,
			title: input.title,
			description: input.description,
			type: input.type,
			durationDays,
			status: 'todo',
			priorityRank: nextRank,
			createdAt
		})
		.returning();
	return task;
}

export async function updateTask(db: Db, id: number, patch: TaskPatch) {
	const value = { ...patch };
	if (value.type === 'milestone') value.durationDays = 0;
	await db.update(tasks).set(value).where(eq(tasks.id, id));
}

export async function deleteTask(db: Db, id: number) {
	await db
		.delete(dependencies)
		.where(or(eq(dependencies.predecessorId, id), eq(dependencies.successorId, id)));
	await db.delete(taskPositions).where(eq(taskPositions.taskId, id));
	await db.delete(tasks).where(eq(tasks.id, id));
}

export async function reorderTasks(db: Db, orderedTaskIds: number[]) {
	for (let i = 0; i < orderedTaskIds.length; i++) {
		await db
			.update(tasks)
			.set({ priorityRank: i + 1 })
			.where(eq(tasks.id, orderedTaskIds[i]));
	}
}
```

- [ ] **Step 2: Write the dependency repository**

Create `src/lib/server/repositories/dependencies.ts`:

```ts
import { eq } from 'drizzle-orm';
import { dependencies } from '../db/schema';
import type { Db } from '../db/client';
import { wouldCreateCycle } from '../scheduling/cycle-detection';

export class CycleError extends Error {
	constructor() {
		super('This dependency would create a cycle');
	}
}

export async function listDependenciesForProject(db: Db, projectId: number) {
	return db.select().from(dependencies).where(eq(dependencies.projectId, projectId)).all();
}

export async function createDependency(
	db: Db,
	projectId: number,
	predecessorId: number,
	successorId: number
) {
	const existing = await listDependenciesForProject(db, projectId);
	const existingEdges = existing.map((e) => ({
		predecessorId: e.predecessorId,
		successorId: e.successorId
	}));
	if (wouldCreateCycle(existingEdges, { predecessorId, successorId })) {
		throw new CycleError();
	}
	const [dependency] = await db
		.insert(dependencies)
		.values({ projectId, predecessorId, successorId })
		.returning();
	return dependency;
}

export async function deleteDependency(db: Db, id: number) {
	await db.delete(dependencies).where(eq(dependencies.id, id));
}
```

- [ ] **Step 3: Write the project layout load**

Create `src/routes/project/[id]/+layout.server.ts`:

```ts
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import { getProject } from '$lib/server/repositories/projects';
import { listTasksForProject } from '$lib/server/repositories/tasks';
import { listDependenciesForProject } from '$lib/server/repositories/dependencies';
import { computeSchedule } from '$lib/server/scheduling/cpm';
import { computeLayers } from '$lib/server/scheduling/layout';

export const load: LayoutServerLoad = async ({ params, platform }) => {
	const db = getDb(platform!.env.DB);
	const projectId = Number(params.id);
	const project = await getProject(db, projectId);
	if (!project) error(404, 'Project not found');

	const tasks = await listTasksForProject(db, projectId);
	const dependencies = await listDependenciesForProject(db, projectId);
	const edges = dependencies.map((d) => ({
		predecessorId: d.predecessorId,
		successorId: d.successorId
	}));

	const schedule = computeSchedule(
		tasks.map((t) => ({ id: t.id, durationDays: t.durationDays })),
		edges
	);
	const layers = computeLayers(
		tasks.map((t) => t.id),
		edges
	);

	const tasksWithSchedule = tasks.map((task) => ({
		...task,
		schedule: schedule.get(task.id)!,
		layer: layers.get(task.id)!
	}));

	return { project, tasks: tasksWithSchedule, dependencies };
};
```

- [ ] **Step 4: Write the project layout shell**

Create `src/routes/project/[id]/+layout.svelte`:

```svelte
<script lang="ts">
	let { data, children } = $props();
</script>

<p><a href="/">&larr; All projects</a></p>
<h1>{data.project.name}</h1>

{@render children()}
```

- [ ] **Step 5: Install the drag-and-drop library**

Run: `npm install svelte-dnd-action`

- [ ] **Step 6: Write the List view server actions**

Create `src/routes/project/[id]/list/+page.server.ts`:

```ts
import { fail, type Actions } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import { createTask, updateTask, deleteTask, reorderTasks } from '$lib/server/repositories/tasks';
import {
	createDependency,
	deleteDependency,
	CycleError
} from '$lib/server/repositories/dependencies';

export const actions: Actions = {
	createTask: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const title = data.get('title');
		if (typeof title !== 'string' || title.trim() === '') {
			return fail(400, { error: 'Title is required' });
		}
		const type = data.get('type') === 'milestone' ? 'milestone' : 'task';
		const durationDays = Number(data.get('durationDays') ?? 1);
		await createTask(db, {
			projectId: Number(params.id),
			title: title.trim(),
			description: String(data.get('description') ?? ''),
			type,
			durationDays: type === 'milestone' ? 0 : durationDays
		});
	},

	updateTask: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const id = Number(data.get('id'));
		const status = data.get('status');
		const durationDays = data.get('durationDays');
		await updateTask(db, id, {
			...(typeof status === 'string' ? { status: status as 'todo' | 'in_progress' | 'done' } : {}),
			...(durationDays !== null ? { durationDays: Number(durationDays) } : {})
		});
	},

	deleteTask: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		await deleteTask(db, Number(data.get('id')));
	},

	createDependency: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const predecessorId = Number(data.get('predecessorId'));
		const successorId = Number(data.get('successorId'));
		try {
			await createDependency(db, Number(params.id), predecessorId, successorId);
		} catch (err) {
			if (err instanceof CycleError) {
				return fail(400, { error: err.message });
			}
			throw err;
		}
	},

	deleteDependency: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		await deleteDependency(db, Number(data.get('id')));
	},

	reorder: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const orderedIds = String(data.get('orderedIds') ?? '')
			.split(',')
			.filter(Boolean)
			.map(Number);
		await reorderTasks(db, orderedIds);
	}
};
```

- [ ] **Step 7: Write the List view UI**

Create `src/routes/project/[id]/list/+page.svelte`:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let items = $state(data.tasks.map((t) => ({ ...t })));
	$effect(() => {
		items = data.tasks.map((t) => ({ ...t }));
	});

	function handleConsider(e: CustomEvent<DndEvent<(typeof items)[number]>>) {
		items = e.detail.items;
	}

	let reorderForm: HTMLFormElement;
	let orderedIdsInput: HTMLInputElement;

	function handleFinalize(e: CustomEvent<DndEvent<(typeof items)[number]>>) {
		items = e.detail.items;
		orderedIdsInput.value = items.map((i) => i.id).join(',');
		reorderForm.requestSubmit();
	}
</script>

<h2>Task list</h2>

<ul
	use:dndzone={{ items, flipDurationMs: 150 }}
	onconsider={handleConsider}
	onfinalize={handleFinalize}
>
	{#each items as task (task.id)}
		<li class:critical={task.schedule.onCriticalPath}>
			<span>{task.type === 'milestone' ? '◆' : '▢'}</span>
			<strong>{task.title}</strong>
			<span>{task.status}</span>
			<span>{task.durationDays}d</span>
			<form method="POST" action="?/deleteTask" use:enhance>
				<input type="hidden" name="id" value={task.id} />
				<button type="submit">Delete</button>
			</form>
		</li>
	{/each}
</ul>

<form bind:this={reorderForm} method="POST" action="?/reorder" use:enhance>
	<input bind:this={orderedIdsInput} type="hidden" name="orderedIds" value="" />
</form>

<h3>Add task</h3>
<form method="POST" action="?/createTask" use:enhance>
	<input type="text" name="title" placeholder="Title" required />
	<textarea name="description" placeholder="Description"></textarea>
	<select name="type">
		<option value="task">Task</option>
		<option value="milestone">Milestone</option>
	</select>
	<input type="number" name="durationDays" min="0" value="1" />
	<button type="submit">Add</button>
</form>

<h3>Add dependency</h3>
<form method="POST" action="?/createDependency" use:enhance>
	<select name="predecessorId">
		{#each data.tasks as task (task.id)}
			<option value={task.id}>{task.title}</option>
		{/each}
	</select>
	<span>must finish before</span>
	<select name="successorId">
		{#each data.tasks as task (task.id)}
			<option value={task.id}>{task.title}</option>
		{/each}
	</select>
	<button type="submit">Add dependency</button>
</form>

<h3>Dependencies</h3>
<ul>
	{#each data.dependencies as dep (dep.id)}
		<li>
			{data.tasks.find((t) => t.id === dep.predecessorId)?.title} &rarr;
			{data.tasks.find((t) => t.id === dep.successorId)?.title}
			<form method="POST" action="?/deleteDependency" use:enhance>
				<input type="hidden" name="id" value={dep.id} />
				<button type="submit">Remove</button>
			</form>
		</li>
	{/each}
</ul>

<style>
	.critical {
		outline: 2px solid crimson;
	}
</style>
```

- [ ] **Step 8: Write the e2e test**

Create `e2e/list-view.e2e.ts`:

```ts
import { expect, test } from '@playwright/test';

test('create tasks, add a dependency, reject a cycle, and see the critical path highlighted', async ({
	page
}) => {
	const projectName = `E2E List ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await expect(page.locator('h2', { hasText: 'Task list' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('Buy bread');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.locator('li').filter({ hasText: 'Buy bread' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('Spread peanut butter');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.locator('li').filter({ hasText: 'Spread peanut butter' })).toBeVisible();

	// Buy bread -> Spread peanut butter
	const predecessorSelect = page.locator('select[name="predecessorId"]');
	const successorSelect = page.locator('select[name="successorId"]');
	await predecessorSelect.selectOption({ label: 'Buy bread' });
	await successorSelect.selectOption({ label: 'Spread peanut butter' });
	await page.getByRole('button', { name: 'Add dependency' }).click();
	await expect(
		page.locator('li').filter({ hasText: 'Buy bread → Spread peanut butter' })
	).toBeVisible();

	// Attempting the reverse dependency should be rejected as a cycle.
	await predecessorSelect.selectOption({ label: 'Spread peanut butter' });
	await successorSelect.selectOption({ label: 'Buy bread' });
	await page.getByRole('button', { name: 'Add dependency' }).click();
	await expect(page.getByText('This dependency would create a cycle')).toBeVisible();

	// Both tasks are on the only path through the graph, so both are critical.
	await expect(page.locator('li.critical').filter({ hasText: 'Buy bread' })).toBeVisible();
	await expect(
		page.locator('li.critical').filter({ hasText: 'Spread peanut butter' })
	).toBeVisible();
});
```

- [ ] **Step 9: Run the e2e test**

Run: `npx playwright test e2e/list-view.e2e.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/server/repositories/tasks.ts src/lib/server/repositories/dependencies.ts src/routes/project package.json package-lock.json e2e/list-view.e2e.ts
git commit -m "feat: add task/dependency CRUD and the List view"
```

---

## Task 8: Dependency-order violation warnings

**Files:**

- Create: `src/lib/order-validation.ts`
- Test: `src/lib/order-validation.test.ts`
- Modify: `src/routes/project/[id]/list/+page.svelte`
- Test: `e2e/list-order-warning.e2e.ts`

**Interfaces:**

- Consumes: page data shape `{ tasks, dependencies }` (Task 7).
- Produces: `findOrderViolations(tasks: { id: number; priorityRank: number }[], dependencies: { predecessorId: number; successorId: number }[]): Set<number>` from `$lib/order-validation`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/order-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findOrderViolations } from './order-validation';

describe('findOrderViolations', () => {
	it('returns an empty set when predecessors are ranked before successors', () => {
		const tasks = [
			{ id: 1, priorityRank: 1 },
			{ id: 2, priorityRank: 2 }
		];
		const dependencies = [{ predecessorId: 1, successorId: 2 }];
		expect(findOrderViolations(tasks, dependencies)).toEqual(new Set());
	});

	it('flags both tasks when a successor is ranked above its predecessor', () => {
		const tasks = [
			{ id: 1, priorityRank: 2 },
			{ id: 2, priorityRank: 1 }
		];
		const dependencies = [{ predecessorId: 1, successorId: 2 }];
		expect(findOrderViolations(tasks, dependencies)).toEqual(new Set([1, 2]));
	});

	it('ignores unrelated tasks with no dependency between them', () => {
		const tasks = [
			{ id: 1, priorityRank: 2 },
			{ id: 2, priorityRank: 1 }
		];
		expect(findOrderViolations(tasks, [])).toEqual(new Set());
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/order-validation.test.ts`
Expected: FAIL with "Cannot find module './order-validation'".

- [ ] **Step 3: Implement**

Create `src/lib/order-validation.ts`:

```ts
export interface RankedTask {
	id: number;
	priorityRank: number;
}

export interface DependencyEdge {
	predecessorId: number;
	successorId: number;
}

export function findOrderViolations(
	tasks: RankedTask[],
	dependencies: DependencyEdge[]
): Set<number> {
	const rankOf = new Map(tasks.map((t) => [t.id, t.priorityRank]));
	const violations = new Set<number>();

	for (const edge of dependencies) {
		const predecessorRank = rankOf.get(edge.predecessorId);
		const successorRank = rankOf.get(edge.successorId);
		if (predecessorRank === undefined || successorRank === undefined) continue;
		if (successorRank < predecessorRank) {
			violations.add(edge.predecessorId);
			violations.add(edge.successorId);
		}
	}

	return violations;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/order-validation.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Wire the warning into the List view**

In `src/routes/project/[id]/list/+page.svelte`, add the import and derived value:

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { findOrderViolations } from '$lib/order-validation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let items = $state(data.tasks.map((t) => ({ ...t })));
	$effect(() => {
		items = data.tasks.map((t) => ({ ...t }));
	});

	let violatingTaskIds = $derived(findOrderViolations(data.tasks, data.dependencies));

	function handleConsider(e: CustomEvent<DndEvent<(typeof items)[number]>>) {
		items = e.detail.items;
	}

	let reorderForm: HTMLFormElement;
	let orderedIdsInput: HTMLInputElement;

	function handleFinalize(e: CustomEvent<DndEvent<(typeof items)[number]>>) {
		items = e.detail.items;
		orderedIdsInput.value = items.map((i) => i.id).join(',');
		reorderForm.requestSubmit();
	}
</script>
```

And inside the `{#each items as task (task.id)}` block, add the warning badge right after the duration span:

```svelte
<span>{task.durationDays}d</span>
{#if violatingTaskIds.has(task.id)}
	<span class="warning">⚠ ranked above a predecessor</span>
{/if}
```

Add the warning style next to `.critical`:

```svelte
<style>
	.critical {
		outline: 2px solid crimson;
	}
	.warning {
		color: darkorange;
	}
</style>
```

- [ ] **Step 6: Write the e2e test**

Create `e2e/list-order-warning.e2e.ts`. This drives the `reorder` action directly by setting the hidden form field and submitting it — real pointer-drag simulation with `svelte-dnd-action` is flaky in headless Playwright, and this exercises the exact same server code path and UI re-render:

```ts
import { expect, test } from '@playwright/test';

test('shows a warning when a successor is ranked above its predecessor', async ({ page }) => {
	const projectName = `E2E Order ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Buy bread');
	await page.getByRole('button', { name: 'Add' }).click();
	await page.getByPlaceholder('Title').fill('Spread peanut butter');
	await page.getByRole('button', { name: 'Add' }).click();

	const predecessorSelect = page.locator('select[name="predecessorId"]');
	const successorSelect = page.locator('select[name="successorId"]');
	await predecessorSelect.selectOption({ label: 'Buy bread' });
	await successorSelect.selectOption({ label: 'Spread peanut butter' });
	await page.getByRole('button', { name: 'Add dependency' }).click();

	await expect(page.locator('.warning')).toHaveCount(0);

	const breadId = await page
		.locator('li')
		.filter({ hasText: 'Buy bread' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');
	const spreadId = await page
		.locator('li')
		.filter({ hasText: 'Spread peanut butter' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');

	// Swap the order so the successor (spread) is ranked before its predecessor (buy bread).
	await page.locator('input[name="orderedIds"]').evaluate((el: HTMLInputElement, value: string) => {
		el.value = value;
	}, `${spreadId},${breadId}`);
	await page
		.locator('form[action="?/reorder"]')
		.evaluate((form: HTMLFormElement) => form.requestSubmit());

	await expect(page.locator('.warning')).toHaveCount(2);
});
```

- [ ] **Step 7: Run the e2e test**

Run: `npx playwright test e2e/list-order-warning.e2e.ts`
Expected: PASS.

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: all unit and e2e tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/order-validation.ts src/lib/order-validation.test.ts src/routes/project/[id]/list/+page.svelte e2e/list-order-warning.e2e.ts
git commit -m "feat: warn when a successor is ranked above its predecessor"
```
