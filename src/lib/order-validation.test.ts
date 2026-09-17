import { describe, it, expect } from 'vitest';
import { findOrderViolations, findDateOrderViolations } from './order-validation';

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

describe('findDateOrderViolations', () => {
	it('returns an empty set when a successor starts after its predecessor finishes', () => {
		const tasks = [
			{ id: 1, scheduledDate: '2026-01-01', durationDays: 2 },
			{ id: 2, scheduledDate: '2026-01-03', durationDays: 1 }
		];
		const dependencies = [{ predecessorId: 1, successorId: 2 }];
		expect(findDateOrderViolations(tasks, dependencies)).toEqual(new Set());
	});

	it('flags both tasks when a successor starts before its predecessor finishes', () => {
		const tasks = [
			{ id: 1, scheduledDate: '2026-01-01', durationDays: 2 },
			{ id: 2, scheduledDate: '2026-01-02', durationDays: 1 }
		];
		const dependencies = [{ predecessorId: 1, successorId: 2 }];
		expect(findDateOrderViolations(tasks, dependencies)).toEqual(new Set([1, 2]));
	});

	it('ignores edges where either task has no scheduled date', () => {
		const tasks = [
			{ id: 1, scheduledDate: null, durationDays: 2 },
			{ id: 2, scheduledDate: '2026-01-02', durationDays: 1 }
		];
		const dependencies = [{ predecessorId: 1, successorId: 2 }];
		expect(findDateOrderViolations(tasks, dependencies)).toEqual(new Set());
	});

	it('allows a same-day milestone predecessor (zero duration)', () => {
		const tasks = [
			{ id: 1, scheduledDate: '2026-01-01', durationDays: 0 },
			{ id: 2, scheduledDate: '2026-01-01', durationDays: 1 }
		];
		const dependencies = [{ predecessorId: 1, successorId: 2 }];
		expect(findDateOrderViolations(tasks, dependencies)).toEqual(new Set());
	});
});
