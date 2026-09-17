export interface CalendarDay {
	iso: string;
	date: Date;
	inCurrentMonth: boolean;
}

export interface ScheduledTaskInput {
	id: number;
	title: string;
	scheduledDate: string;
	durationDays: number;
}

export interface WeekSegment {
	taskId: number;
	title: string;
	weekIndex: number;
	startCol: number;
	span: number;
	lane: number;
	isStart: boolean;
}

function toIso(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

function addDaysToIso(isoDate: string, days: number): string {
	const [year, month, day] = isoDate.split('-').map(Number);
	return toIso(new Date(year, month - 1, day + days));
}

/** Weeks (Sunday-start) covering `month` (1-12), trimmed to only the weeks that touch it. */
export function getMonthWeeks(year: number, month: number): CalendarDay[][] {
	const firstOfMonth = new Date(year, month - 1, 1);
	const lastOfMonth = new Date(year, month, 0);
	const start = new Date(firstOfMonth);
	start.setDate(start.getDate() - start.getDay());
	const end = new Date(lastOfMonth);
	end.setDate(end.getDate() + (6 - end.getDay()));

	const weeks: CalendarDay[][] = [];
	let week: CalendarDay[] = [];
	for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
		const date = new Date(cursor);
		week.push({
			iso: toIso(date),
			date,
			inCurrentMonth: date.getMonth() === month - 1 && date.getFullYear() === year
		});
		if (week.length === 7) {
			weeks.push(week);
			week = [];
		}
	}
	return weeks;
}

/**
 * Clips each task's [scheduledDate, scheduledDate + durationDays) span to the weeks it
 * overlaps, then greedily assigns each week's clipped segments to non-overlapping lanes
 * so multi-day bars can stack without visually colliding.
 */
export function computeWeekSegments(
	weeks: CalendarDay[][],
	tasks: ScheduledTaskInput[]
): WeekSegment[] {
	const segments: WeekSegment[] = [];

	weeks.forEach((week, weekIndex) => {
		const weekStart = week[0].iso;
		const weekEnd = week[6].iso;

		const weekEvents = tasks
			.map((task) => {
				const taskEnd = addDaysToIso(task.scheduledDate, Math.max(task.durationDays, 1) - 1);
				if (taskEnd < weekStart || task.scheduledDate > weekEnd) return null;
				const clippedStart = task.scheduledDate < weekStart ? weekStart : task.scheduledDate;
				const clippedEnd = taskEnd > weekEnd ? weekEnd : taskEnd;
				const startCol = week.findIndex((d) => d.iso === clippedStart);
				const endCol = week.findIndex((d) => d.iso === clippedEnd);
				return {
					taskId: task.id,
					title: task.title,
					startCol,
					span: endCol - startCol + 1,
					isStart: clippedStart === task.scheduledDate
				};
			})
			.filter((event) => event !== null)
			.sort((a, b) => a.startCol - b.startCol);

		const laneEndCols: number[] = [];
		for (const event of weekEvents) {
			let lane = laneEndCols.findIndex((endCol) => endCol < event.startCol);
			if (lane === -1) {
				lane = laneEndCols.length;
				laneEndCols.push(event.startCol + event.span - 1);
			} else {
				laneEndCols[lane] = event.startCol + event.span - 1;
			}
			segments.push({ ...event, weekIndex, lane });
		}
	});

	return segments;
}
