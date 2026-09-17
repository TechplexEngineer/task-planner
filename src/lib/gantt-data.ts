export interface GanttTask {
	id: number;
	text: string;
	start: Date;
	end: Date;
	type: 'task' | 'milestone';
	critical: boolean;
}

export interface GanttLink {
	id: number;
	source: number;
	target: number;
	type: 'e2s';
}

interface ScheduledTaskInput {
	id: number;
	title: string;
	type: 'task' | 'milestone';
	displaySchedule: {
		start: number;
		finish: number;
	};
	schedule: {
		onCriticalPath: boolean;
	};
}

interface DependencyEdgeInput {
	id: number;
	predecessorId: number;
	successorId: number;
}

function addDays(isoDate: string, days: number): Date {
	const [year, month, day] = isoDate.split('-').map(Number);
	return new Date(year, month - 1, day + days);
}

export function toGanttTasks(projectStartDate: string, tasks: ScheduledTaskInput[]): GanttTask[] {
	return tasks.map((task) => ({
		id: task.id,
		text: task.title,
		start: addDays(projectStartDate, task.displaySchedule.start),
		end: addDays(projectStartDate, task.displaySchedule.finish),
		type: task.type,
		critical: task.schedule.onCriticalPath
	}));
}

// Inverse of addDays: turns a calendar date picked in the Gantt UI back into a
// day-offset from the project start, so it can be compared against day-offset
// schedule data. Normalizes both sides to local midnight first so DST
// transitions can't shift the result by a fractional day.
export function dateToOffsetDays(projectStartDate: string, date: Date): number {
	const [year, month, day] = projectStartDate.split('-').map(Number);
	const start = new Date(year, month - 1, day);
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return Math.round((target.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function toGanttLinks(dependencies: DependencyEdgeInput[]): GanttLink[] {
	return dependencies.map((dependency) => ({
		id: dependency.id,
		source: dependency.predecessorId,
		target: dependency.successorId,
		type: 'e2s'
	}));
}
