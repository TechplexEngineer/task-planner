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
