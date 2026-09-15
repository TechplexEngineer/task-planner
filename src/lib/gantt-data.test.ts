import { describe, it, expect } from 'vitest';
import { toGanttTasks, toGanttLinks } from './gantt-data';

describe('toGanttTasks', () => {
	it('converts earliest-start/finish day offsets into calendar dates from the project start date', () => {
		const tasks = [
			{
				id: 1,
				title: 'Buy bread',
				type: 'task' as const,
				schedule: { earliestStart: 2, earliestFinish: 5, onCriticalPath: false }
			}
		];
		const [ganttTask] = toGanttTasks('2026-01-01', tasks);
		expect(ganttTask.start.toISOString().slice(0, 10)).toBe('2026-01-03');
		expect(ganttTask.end.toISOString().slice(0, 10)).toBe('2026-01-06');
	});

	it('gives a milestone a zero-length span when earliest start equals earliest finish', () => {
		const tasks = [
			{
				id: 2,
				title: 'Loaf ready',
				type: 'milestone' as const,
				schedule: { earliestStart: 3, earliestFinish: 3, onCriticalPath: true }
			}
		];
		const [ganttTask] = toGanttTasks('2026-01-01', tasks);
		expect(ganttTask.start.getTime()).toBe(ganttTask.end.getTime());
	});

	it('marks a task critical exactly when its schedule is on the critical path', () => {
		const tasks = [
			{
				id: 1,
				title: 'Buy bread',
				type: 'task' as const,
				schedule: { earliestStart: 0, earliestFinish: 1, onCriticalPath: true }
			},
			{
				id: 2,
				title: 'Side errand',
				type: 'task' as const,
				schedule: { earliestStart: 0, earliestFinish: 1, onCriticalPath: false }
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
				schedule: { earliestStart: 0, earliestFinish: 1, onCriticalPath: false }
			}
		];
		const [ganttTask] = toGanttTasks('2026-01-01', tasks);
		expect(ganttTask.id).toBe(42);
		expect(ganttTask.text).toBe('Spread peanut butter');
		expect(ganttTask.type).toBe('task');
	});
});

describe('toGanttLinks', () => {
	it('maps dependency edges to finish-to-start links using predecessor/successor ids', () => {
		const dependencies = [{ id: 7, predecessorId: 1, successorId: 2 }];
		expect(toGanttLinks(dependencies)).toEqual([{ id: 7, source: 1, target: 2, type: 'e2s' }]);
	});
});
