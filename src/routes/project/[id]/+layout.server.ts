import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import { getProject } from '$lib/server/repositories/projects';
import { listTasksForProject } from '$lib/server/repositories/tasks';
import { listDependenciesForProject } from '$lib/server/repositories/dependencies';
import { computeSchedule } from '$lib/server/scheduling/cpm';
import { computeLayers } from '$lib/server/scheduling/layout';

export const load: LayoutServerLoad = async ({ params, platform }) => {
	const db = getDb(platform!.env.DB);
	const projectId = Number(params.id);
	const project = await getProject(db, projectId);
	if (!project) error(404, 'Project not found');

	const tasks = await listTasksForProject(db, projectId);
	const dependencies = await listDependenciesForProject(db, projectId);
	const edges = dependencies.map((d) => ({
		predecessorId: d.predecessorId,
		successorId: d.successorId
	}));

	const schedule = computeSchedule(
		tasks.map((t) => ({ id: t.id, durationDays: t.durationDays })),
		edges
	);
	const layers = computeLayers(
		tasks.map((t) => t.id),
		edges
	);

	const tasksWithSchedule = tasks.map((task) => ({
		...task,
		schedule: schedule.get(task.id)!,
		layer: layers.get(task.id)!
	}));

	return { project, tasks: tasksWithSchedule, dependencies };
};
