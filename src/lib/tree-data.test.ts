import { describe, it, expect } from 'vitest';
import { flattenTree, type TreeTaskInput } from './tree-data';

function task(overrides: Partial<TreeTaskInput> & { id: number }): TreeTaskInput {
	return {
		parentId: null,
		treeRank: 0,
		title: `Task ${overrides.id}`,
		type: 'task',
		...overrides
	};
}

describe('flattenTree', () => {
	it('orders root tasks by treeRank', () => {
		const tasks = [
			task({ id: 1, treeRank: 1 }),
			task({ id: 2, treeRank: 0 }),
			task({ id: 3, treeRank: 2 })
		];
		const rows = flattenTree(tasks, new Set());
		expect(rows.map((r) => r.id)).toEqual([2, 1, 3]);
	});

	it('nests children directly under their parent, depth-first', () => {
		const tasks = [
			task({ id: 1, treeRank: 0 }),
			task({ id: 2, parentId: 1, treeRank: 0 }),
			task({ id: 3, treeRank: 1 })
		];
		const rows = flattenTree(tasks, new Set());
		expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
		expect(rows.map((r) => r.depth)).toEqual([0, 1, 0]);
	});

	it('marks a task with children as hasChildren', () => {
		const tasks = [task({ id: 1 }), task({ id: 2, parentId: 1 })];
		const rows = flattenTree(tasks, new Set());
		expect(rows.find((r) => r.id === 1)?.hasChildren).toBe(true);
		expect(rows.find((r) => r.id === 2)?.hasChildren).toBe(false);
	});

	it('hides descendants of a collapsed task but keeps the task itself visible', () => {
		const tasks = [
			task({ id: 1 }),
			task({ id: 2, parentId: 1 }),
			task({ id: 3, parentId: 2 }),
			task({ id: 4, treeRank: 1 })
		];
		const rows = flattenTree(tasks, new Set([1]));
		expect(rows.map((r) => r.id)).toEqual([1, 4]);
	});
});
