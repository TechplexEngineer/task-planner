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
