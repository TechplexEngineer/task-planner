import { describe, it, expect } from 'vitest';
import { computeLayers } from './layout';

describe('computeLayers', () => {
	it('puts every task in layer 0 when there are no edges', () => {
		const layers = computeLayers([1, 2, 3], []);
		expect(layers.get(1)).toBe(0);
		expect(layers.get(2)).toBe(0);
		expect(layers.get(3)).toBe(0);
	});

	it('assigns increasing layers along a chain', () => {
		const layers = computeLayers(
			[1, 2, 3],
			[
				{ predecessorId: 1, successorId: 2 },
				{ predecessorId: 2, successorId: 3 }
			]
		);
		expect(layers.get(1)).toBe(0);
		expect(layers.get(2)).toBe(1);
		expect(layers.get(3)).toBe(2);
	});

	it('uses the longest incoming path for a diamond shape', () => {
		const layers = computeLayers(
			[1, 2, 3, 4],
			[
				{ predecessorId: 1, successorId: 2 },
				{ predecessorId: 1, successorId: 3 },
				{ predecessorId: 2, successorId: 4 },
				{ predecessorId: 3, successorId: 4 }
			]
		);
		expect(layers.get(1)).toBe(0);
		expect(layers.get(2)).toBe(1);
		expect(layers.get(3)).toBe(1);
		expect(layers.get(4)).toBe(2);
	});

	it('leaves a disconnected task at layer 0', () => {
		const layers = computeLayers([1, 2, 99], [{ predecessorId: 1, successorId: 2 }]);
		expect(layers.get(99)).toBe(0);
	});
});
