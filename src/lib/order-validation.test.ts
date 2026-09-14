import { describe, it, expect } from 'vitest';
import { findOrderViolations } from './order-validation';

describe('findOrderViolations', () => {
	it('returns an empty set when predecessors are ranked before successors', () => {
		const tasks = [
			{ id: 1, priorityRank: 1 },
			{ id: 2, priorityRank: 2 }
		];
		const dependencies = [{ predecessorId: 1, successorId: 2 }];
		expect(findOrderViolations(tasks, dependencies)).toEqual(new Set());
	});

	it('flags both tasks when a successor is ranked above its predecessor', () => {
		const tasks = [
			{ id: 1, priorityRank: 2 },
			{ id: 2, priorityRank: 1 }
		];
		const dependencies = [{ predecessorId: 1, successorId: 2 }];
		expect(findOrderViolations(tasks, dependencies)).toEqual(new Set([1, 2]));
	});

	it('ignores unrelated tasks with no dependency between them', () => {
		const tasks = [
			{ id: 1, priorityRank: 2 },
			{ id: 2, priorityRank: 1 }
		];
		expect(findOrderViolations(tasks, [])).toEqual(new Set());
	});
});
