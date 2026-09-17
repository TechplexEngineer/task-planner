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

export interface DatedTask {
	id: number;
	scheduledDate: string | null;
	durationDays: number;
}

function addDaysToIso(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	const date = new Date(year, month - 1, day + days);
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function findDateOrderViolations(
	tasks: DatedTask[],
	dependencies: DependencyEdge[]
): Set<number> {
	const taskById = new Map(tasks.map((t) => [t.id, t]));
	const violations = new Set<number>();

	for (const edge of dependencies) {
		const predecessor = taskById.get(edge.predecessorId);
		const successor = taskById.get(edge.successorId);
		if (!predecessor?.scheduledDate || !successor?.scheduledDate) continue;
		const predecessorEnd = addDaysToIso(predecessor.scheduledDate, predecessor.durationDays);
		if (successor.scheduledDate < predecessorEnd) {
			violations.add(predecessor.id);
			violations.add(successor.id);
		}
	}

	return violations;
}
