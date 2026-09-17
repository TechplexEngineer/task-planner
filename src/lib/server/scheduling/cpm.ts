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

// A memoized forward pass over the dependency DAG: each task starts at the
// latest of its predecessors' finishes (0 if it has none), plus whatever
// per-task delay the caller supplies, and finishes `durationDays` later. Used
// both for the zero-lag earliest schedule (delay always 0) and for the
// delay-aware display schedule below.
function computeForwardPass(
	tasks: SchedulingTask[],
	edges: SchedulingEdge[],
	delayOf: (id: number) => number
): { start: Map<number, number>; finish: Map<number, number> } {
	const durationOf = new Map(tasks.map((t) => [t.id, t.durationDays]));
	const predecessorsOf = new Map<number, number[]>();
	for (const task of tasks) predecessorsOf.set(task.id, []);
	for (const edge of edges) predecessorsOf.get(edge.successorId)?.push(edge.predecessorId);

	const start = new Map<number, number>();
	const finish = new Map<number, number>();

	function computeFinish(id: number): number {
		if (finish.has(id)) return finish.get(id)!;
		const preds = predecessorsOf.get(id) ?? [];
		const floor = preds.length === 0 ? 0 : Math.max(...preds.map(computeFinish));
		const taskStart = floor + delayOf(id);
		const taskFinish = taskStart + (durationOf.get(id) ?? 0);
		start.set(id, taskStart);
		finish.set(id, taskFinish);
		return taskFinish;
	}

	for (const task of tasks) computeFinish(task.id);
	return { start, finish };
}

export function computeSchedule(
	tasks: SchedulingTask[],
	edges: SchedulingEdge[]
): Map<number, ScheduleEntry> {
	const durationOf = new Map(tasks.map((t) => [t.id, t.durationDays]));
	const successorsOf = new Map<number, number[]>();
	for (const task of tasks) successorsOf.set(task.id, []);
	for (const edge of edges) successorsOf.get(edge.predecessorId)?.push(edge.successorId);

	const { start: earliestStart, finish: earliestFinish } = computeForwardPass(
		tasks,
		edges,
		() => 0
	);

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

export interface DisplaySchedulingTask {
	id: number;
	durationDays: number;
	startDelayDays: number;
}

export interface DisplayScheduleEntry {
	start: number;
	finish: number;
}

// Unlike computeSchedule's earliestStart/earliestFinish (a zero-lag "as soon as
// possible" schedule used for critical-path analysis), this threads each task's
// *actual*, delay-adjusted finish into its successors' floor. A dependency edge
// only ever raises that floor - it never pins the successor to it - so manually
// delaying a task pushes the display schedule of everything downstream without
// ever letting a successor be shown before its predecessors finish.
export function computeDisplaySchedule(
	tasks: DisplaySchedulingTask[],
	edges: SchedulingEdge[]
): Map<number, DisplayScheduleEntry> {
	const delayOf = new Map(tasks.map((t) => [t.id, t.startDelayDays]));
	const { start, finish } = computeForwardPass(tasks, edges, (id) => delayOf.get(id) ?? 0);

	const result = new Map<number, DisplayScheduleEntry>();
	for (const task of tasks) {
		result.set(task.id, { start: start.get(task.id)!, finish: finish.get(task.id)! });
	}
	return result;
}
