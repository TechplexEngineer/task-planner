import { describe, it, expect } from 'vitest';
import { toGanttTasks, toGanttLinks, dateToOffsetDays } from './gantt-data';

describe('toGanttTasks', () => {
	it('converts earliest-start/finish day offsets into calendar dates from the project start date', () => {
		const tasks = [
			{
				id: 1,
				title: 'Buy bread',
				type: 'task' as const,
				displaySchedule: { start: 2, finish: 5 },
				schedule: { onCriticalPath: false }
			}
		];
		const [ganttTask] = toGanttTasks('2026-01-01', tasks);
		expect(ganttTask.start.getFullYear()).toBe(2026);
		expect(ganttTask.start.getMonth()).toBe(0); // January is 0
		expect(ganttTask.start.getDate()).toBe(3);
		expect(ganttTask.end.getFullYear()).toBe(2026);
		expect(ganttTask.end.getMonth()).toBe(0);
		expect(ganttTask.end.getDate()).toBe(6);
	});

	it('gives a milestone a zero-length span when earliest start equals earliest finish', () => {
		const tasks = [
			{
				id: 2,
				title: 'Loaf ready',
				type: 'milestone' as const,
				displaySchedule: { start: 3, finish: 3 },
				schedule: { onCriticalPath: true }
			}
		];
		const [ganttTask] = toGanttTasks('2026-01-01', tasks);
		expect(ganttTask.start.getFullYear()).toBe(2026);
		expect(ganttTask.start.getMonth()).toBe(0);
		expect(ganttTask.start.getDate()).toBe(4);
		expect(ganttTask.start.getTime()).toBe(ganttTask.end.getTime());
	});

	it('marks a task critical exactly when its schedule is on the critical path', () => {
		const tasks = [
			{
				id: 1,
				title: 'Buy bread',
				type: 'task' as const,
				displaySchedule: { start: 0, finish: 1 },
				schedule: { onCriticalPath: true }
			},
			{
				id: 2,
				title: 'Side errand',
				type: 'task' as const,
				displaySchedule: { start: 0, finish: 1 },
				schedule: { onCriticalPath: false }
			}
		];
		const [critical, notCritical] = toGanttTasks('2026-01-01', tasks);
		expect(critical.critical).toBe(true);
		expect(notCritical.critical).toBe(false);
	});

	it('passes through the task id, title, and type', () => {
		const tasks = [
			{
				id: 42,
				title: 'Spread peanut butter',
				type: 'task' as const,
				displaySchedule: { start: 0, finish: 1 },
				schedule: { onCriticalPath: false }
			}
		];
		const [ganttTask] = toGanttTasks('2026-01-01', tasks);
		expect(ganttTask.id).toBe(42);
		expect(ganttTask.text).toBe('Spread peanut butter');
		expect(ganttTask.type).toBe('task');
	});

	it('produces the same calendar date regardless of the process timezone', () => {
		const originalTz = process.env.TZ;
		process.env.TZ = 'America/New_York';
		try {
			const tasks = [
				{
					id: 1,
					title: 'Buy bread',
					type: 'task' as const,
					displaySchedule: { start: 0, finish: 1 },
					schedule: { onCriticalPath: false }
				}
			];
			const [ganttTask] = toGanttTasks('2026-01-01', tasks);
			expect(ganttTask.start.getFullYear()).toBe(2026);
			expect(ganttTask.start.getMonth()).toBe(0);
			expect(ganttTask.start.getDate()).toBe(1);
		} finally {
			process.env.TZ = originalTz;
		}
	});

	it('renders a gap between a task and its predecessor when its display schedule has one', () => {
		const tasks = [
			{
				id: 1,
				title: 'Buy bread',
				type: 'task' as const,
				displaySchedule: { start: 0, finish: 1 },
				schedule: { onCriticalPath: false }
			},
			{
				id: 2,
				title: 'Spread peanut butter',
				type: 'task' as const,
				displaySchedule: { start: 4, finish: 5 },
				schedule: { onCriticalPath: false }
			}
		];
		const [predecessor, successor] = toGanttTasks('2026-01-01', tasks);
		expect(successor.start.getTime()).toBeGreaterThan(predecessor.end.getTime());
	});
});

describe('dateToOffsetDays', () => {
	it('is the inverse of the day-offset used to build calendar dates', () => {
		const [ganttTask] = toGanttTasks('2026-01-01', [
			{
				id: 1,
				title: 'Buy bread',
				type: 'task' as const,
				displaySchedule: { start: 5, finish: 6 },
				schedule: { onCriticalPath: false }
			}
		]);
		expect(dateToOffsetDays('2026-01-01', ganttTask.start)).toBe(5);
	});

	it('produces the same result regardless of the process timezone', () => {
		const originalTz = process.env.TZ;
		process.env.TZ = 'America/New_York';
		try {
			expect(dateToOffsetDays('2026-01-01', new Date(2026, 0, 8))).toBe(7);
		} finally {
			process.env.TZ = originalTz;
		}
	});
});

describe('toGanttLinks', () => {
	it('maps dependency edges to finish-to-start links using predecessor/successor ids', () => {
		const dependencies = [{ id: 7, predecessorId: 1, successorId: 2 }];
		expect(toGanttLinks(dependencies)).toEqual([{ id: 7, source: 1, target: 2, type: 'e2s' }]);
	});
});
