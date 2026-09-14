import { describe, it, expect } from 'vitest';
import { wouldCreateCycle } from './cycle-detection';

describe('wouldCreateCycle', () => {
	it('returns false for a new edge with no existing path back', () => {
		const existing = [{ predecessorId: 1, successorId: 2 }];
		expect(wouldCreateCycle(existing, { predecessorId: 2, successorId: 3 })).toBe(false);
	});

	it('returns true when the new edge closes a direct cycle', () => {
		const existing = [{ predecessorId: 1, successorId: 2 }];
		expect(wouldCreateCycle(existing, { predecessorId: 2, successorId: 1 })).toBe(true);
	});

	it('returns true when the new edge closes an indirect cycle', () => {
		const existing = [
			{ predecessorId: 1, successorId: 2 },
			{ predecessorId: 2, successorId: 3 }
		];
		expect(wouldCreateCycle(existing, { predecessorId: 3, successorId: 1 })).toBe(true);
	});

	it('returns true for a self-loop', () => {
		expect(wouldCreateCycle([], { predecessorId: 1, successorId: 1 })).toBe(true);
	});

	it('returns false for an edge disjoint from all existing edges', () => {
		const existing = [{ predecessorId: 1, successorId: 2 }];
		expect(wouldCreateCycle(existing, { predecessorId: 5, successorId: 6 })).toBe(false);
	});
});
