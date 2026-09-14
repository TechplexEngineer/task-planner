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
