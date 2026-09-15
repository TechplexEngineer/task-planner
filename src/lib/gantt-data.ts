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
	schedule: {
		earliestStart: number;
		earliestFinish: number;
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
		start: addDays(projectStartDate, task.schedule.earliestStart),
		end: addDays(projectStartDate, task.schedule.earliestFinish),
		type: task.type,
		critical: task.schedule.onCriticalPath
	}));
}

export function toGanttLinks(dependencies: DependencyEdgeInput[]): GanttLink[] {
	return dependencies.map((dependency) => ({
		id: dependency.id,
		source: dependency.predecessorId,
		target: dependency.successorId,
		type: 'e2s'
	}));
}
