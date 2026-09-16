import { describe, it, expect } from 'vitest';
import { taskIdsWithChangedLayer } from './offset-reset';

describe('taskIdsWithChangedLayer', () => {
	it('returns an empty list when no layers changed', () => {
		const before = new Map([
			[1, 0],
			[2, 1]
		]);
		const after = new Map([
			[1, 0],
			[2, 1]
		]);
		expect(taskIdsWithChangedLayer(before, after)).toEqual([]);
	});

	it('returns the id of a task whose layer changed', () => {
		const before = new Map([
			[1, 0],
			[2, 1]
		]);
		const after = new Map([
			[1, 0],
			[2, 2]
		]);
		expect(taskIdsWithChangedLayer(before, after)).toEqual([2]);
	});

	it('ignores a brand-new task with no "before" layer', () => {
		const before = new Map([[1, 0]]);
		const after = new Map([
			[1, 0],
			[2, 0]
		]);
		expect(taskIdsWithChangedLayer(before, after)).toEqual([]);
	});

	it('ignores a task that no longer exists after the change', () => {
		const before = new Map([
			[1, 0],
			[2, 1]
		]);
		const after = new Map([[1, 0]]);
		expect(taskIdsWithChangedLayer(before, after)).toEqual([]);
	});
});
