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
