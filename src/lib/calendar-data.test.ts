import { describe, it, expect } from 'vitest';
import { getMonthWeeks, computeWeekSegments } from './calendar-data';

describe('getMonthWeeks', () => {
	it('starts each week on Sunday and ends on Saturday', () => {
		const weeks = getMonthWeeks(2026, 1);
		for (const week of weeks) {
			expect(week).toHaveLength(7);
			expect(week[0].date.getDay()).toBe(0);
			expect(week[6].date.getDay()).toBe(6);
		}
	});

	it('includes leading/trailing days from adjacent months marked as out of month', () => {
		// January 2026 starts on a Thursday, so the first week includes December days.
		const weeks = getMonthWeeks(2026, 1);
		const firstWeek = weeks[0];
		expect(firstWeek.some((d) => !d.inCurrentMonth)).toBe(true);
		expect(firstWeek.some((d) => d.inCurrentMonth && d.iso === '2026-01-01')).toBe(true);
	});

	it('covers every day of the month exactly once', () => {
		const weeks = getMonthWeeks(2026, 2);
		const daysInMonth = weeks
			.flat()
			.filter((d) => d.inCurrentMonth)
			.map((d) => d.iso);
		expect(daysInMonth).toHaveLength(28);
		expect(daysInMonth[0]).toBe('2026-02-01');
		expect(daysInMonth[27]).toBe('2026-02-28');
	});
});

describe('computeWeekSegments', () => {
	it('places a single-day task in its own segment starting on its date', () => {
		const weeks = getMonthWeeks(2026, 1);
		const segments = computeWeekSegments(weeks, [
			{ id: 1, title: 'Task A', scheduledDate: '2026-01-05', durationDays: 1 }
		]);
		expect(segments).toHaveLength(1);
		expect(segments[0]).toMatchObject({ taskId: 1, span: 1, isStart: true, lane: 0 });
	});

	it('spans a multi-day task across columns within a week', () => {
		const weeks = getMonthWeeks(2026, 1);
		// 2026-01-05 is a Monday; a 3-day task runs Mon-Wed.
		const segments = computeWeekSegments(weeks, [
			{ id: 1, title: 'Task A', scheduledDate: '2026-01-05', durationDays: 3 }
		]);
		expect(segments).toHaveLength(1);
		expect(segments[0].span).toBe(3);
		expect(segments[0].startCol).toBe(1); // Monday column
	});

	it('splits a task that crosses a week boundary into two segments', () => {
		const weeks = getMonthWeeks(2026, 1);
		// 2026-01-09 is a Friday; a 4-day task runs Fri-Mon, crossing into the next week.
		const segments = computeWeekSegments(weeks, [
			{ id: 1, title: 'Task A', scheduledDate: '2026-01-09', durationDays: 4 }
		]);
		expect(segments).toHaveLength(2);
		const [first, second] = segments.sort((a, b) => a.weekIndex - b.weekIndex);
		expect(first.isStart).toBe(true);
		expect(second.isStart).toBe(false);
		expect(second.weekIndex).toBe(first.weekIndex + 1);
	});

	it('assigns overlapping tasks to different lanes', () => {
		const weeks = getMonthWeeks(2026, 1);
		const segments = computeWeekSegments(weeks, [
			{ id: 1, title: 'Task A', scheduledDate: '2026-01-05', durationDays: 3 },
			{ id: 2, title: 'Task B', scheduledDate: '2026-01-06', durationDays: 1 }
		]);
		const laneA = segments.find((s) => s.taskId === 1)!.lane;
		const laneB = segments.find((s) => s.taskId === 2)!.lane;
		expect(laneA).not.toBe(laneB);
	});

	it('reuses a lane once its previous occupant has ended', () => {
		const weeks = getMonthWeeks(2026, 1);
		const segments = computeWeekSegments(weeks, [
			{ id: 1, title: 'Task A', scheduledDate: '2026-01-05', durationDays: 1 },
			{ id: 2, title: 'Task B', scheduledDate: '2026-01-06', durationDays: 1 }
		]);
		expect(segments.find((s) => s.taskId === 1)!.lane).toBe(0);
		expect(segments.find((s) => s.taskId === 2)!.lane).toBe(0);
	});
});
