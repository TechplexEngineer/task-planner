import { describe, it, expect } from 'vitest';
import { computeAutoLayout } from './graph-autolayout';
import { GRAPH_COLUMN_WIDTH, NODE_SIZE } from './graph-layout';

describe('computeAutoLayout', () => {
	it('keeps a pinned task exactly at its given position', () => {
		const positions = computeAutoLayout(
			[{ id: 1, layer: 0, priorityRank: 1 }],
			[],
			new Map([[1, { x: 500, y: 500 }]])
		);
		expect(positions.get(1)).toEqual({ x: 500, y: 500 });
	});

	it('pushes crowded unpinned tasks apart to at least a node-size gap', () => {
		const positions = computeAutoLayout(
			[
				{ id: 1, layer: 0, priorityRank: 1 },
				{ id: 2, layer: 0, priorityRank: 2 }
			],
			[],
			new Map()
		);
		const a = positions.get(1)!;
		const b = positions.get(2)!;
		const distance = Math.hypot(a.x - b.x, a.y - b.y);
		expect(distance).toBeGreaterThanOrEqual(NODE_SIZE * 1.5 - 1);
	});

	it('pulls dependency-connected tasks that start far apart closer together', () => {
		const tasks = [
			{ id: 1, layer: 0, priorityRank: 1 },
			{ id: 2, layer: 5, priorityRank: 1 }
		];
		const edges = [{ predecessorId: 1, successorId: 2 }];
		const initialDistance = 5 * GRAPH_COLUMN_WIDTH;

		const positions = computeAutoLayout(tasks, edges, new Map());
		const a = positions.get(1)!;
		const b = positions.get(2)!;
		const finalDistance = Math.hypot(a.x - b.x, a.y - b.y);

		expect(finalDistance).toBeLessThan(initialDistance / 2);
	});

	it('keeps a successor to the right of its predecessor even when crowded', () => {
		const tasks = [
			{ id: 1, layer: 0, priorityRank: 1 },
			{ id: 2, layer: 1, priorityRank: 1 },
			{ id: 3, layer: 1, priorityRank: 2 }
		];
		const edges = [{ predecessorId: 1, successorId: 2 }];

		const positions = computeAutoLayout(tasks, edges, new Map());
		const predecessor = positions.get(1)!;
		const successor = positions.get(2)!;

		expect(successor.x).toBeGreaterThan(predecessor.x);
	});

	it('is deterministic for the same input', () => {
		const tasks = [
			{ id: 1, layer: 0, priorityRank: 1 },
			{ id: 2, layer: 1, priorityRank: 1 },
			{ id: 3, layer: 1, priorityRank: 2 }
		];
		const edges = [{ predecessorId: 1, successorId: 2 }];

		const first = computeAutoLayout(tasks, edges, new Map());
		const second = computeAutoLayout(tasks, edges, new Map());

		expect(first).toEqual(second);
	});

	it('returns an empty map for no tasks', () => {
		expect(computeAutoLayout([], [], new Map()).size).toBe(0);
	});

	it('never pushes an unpinned task off the top-left of the canvas', () => {
		// Two tasks sharing a layer (e.g. after a dependency between them was
		// removed) start closer together than MIN_SEPARATION - repulsion must not
		// push the top/left one into negative coordinates, off the visible canvas.
		const positions = computeAutoLayout(
			[
				{ id: 1, layer: 0, priorityRank: 1 },
				{ id: 2, layer: 0, priorityRank: 2 }
			],
			[],
			new Map()
		);
		for (const position of positions.values()) {
			expect(position.x).toBeGreaterThanOrEqual(0);
			expect(position.y).toBeGreaterThanOrEqual(0);
		}
	});
});
