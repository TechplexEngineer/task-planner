import { describe, it, expect } from 'vitest';
import { computeSchedule } from './cpm';

describe('computeSchedule', () => {
	it('schedules a single task starting at day 0', () => {
		const schedule = computeSchedule([{ id: 1, durationDays: 3 }], []);
		expect(schedule.get(1)).toEqual({
			earliestStart: 0,
			earliestFinish: 3,
			latestStart: 0,
			latestFinish: 3,
			slack: 0,
			onCriticalPath: true
		});
	});

	it('chains tasks back to back with zero slack throughout', () => {
		const schedule = computeSchedule(
			[
				{ id: 1, durationDays: 2 },
				{ id: 2, durationDays: 3 },
				{ id: 3, durationDays: 1 }
			],
			[
				{ predecessorId: 1, successorId: 2 },
				{ predecessorId: 2, successorId: 3 }
			]
		);
		expect(schedule.get(1)?.earliestStart).toBe(0);
		expect(schedule.get(2)?.earliestStart).toBe(2);
		expect(schedule.get(3)?.earliestStart).toBe(5);
		expect(schedule.get(3)?.earliestFinish).toBe(6);
		expect(schedule.get(1)?.onCriticalPath).toBe(true);
		expect(schedule.get(2)?.onCriticalPath).toBe(true);
		expect(schedule.get(3)?.onCriticalPath).toBe(true);
	});

	it('gives the shorter parallel branch positive slack and the longer branch zero slack', () => {
		const schedule = computeSchedule(
			[
				{ id: 1, durationDays: 1 },
				{ id: 2, durationDays: 1 },
				{ id: 3, durationDays: 5 }
			],
			[
				{ predecessorId: 1, successorId: 2 },
				{ predecessorId: 1, successorId: 3 }
			]
		);
		expect(schedule.get(2)?.slack).toBe(4);
		expect(schedule.get(2)?.onCriticalPath).toBe(false);
		expect(schedule.get(3)?.slack).toBe(0);
		expect(schedule.get(3)?.onCriticalPath).toBe(true);
	});

	it('schedules a zero-duration milestone right after its predecessor finishes', () => {
		const schedule = computeSchedule(
			[
				{ id: 1, durationDays: 2 },
				{ id: 2, durationDays: 0 }
			],
			[{ predecessorId: 1, successorId: 2 }]
		);
		expect(schedule.get(2)?.earliestStart).toBe(2);
		expect(schedule.get(2)?.earliestFinish).toBe(2);
		expect(schedule.get(2)?.onCriticalPath).toBe(true);
	});
});
