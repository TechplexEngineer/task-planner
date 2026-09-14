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
