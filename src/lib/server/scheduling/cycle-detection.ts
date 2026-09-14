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
