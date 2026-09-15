import { type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import { listPositionsForTasks } from '$lib/server/repositories/positions';
import { computeBasePositions } from '$lib/graph-layout';
import { createTask } from '$lib/server/repositories/tasks';
import { createDependency } from '$lib/server/repositories/dependencies';

export const load: PageServerLoad = async ({ parent, platform }) => {
	const { project, tasks, dependencies } = await parent();
	const db = getDb(platform!.env.DB);
	const offsets = await listPositionsForTasks(
		db,
		tasks.map((t) => t.id)
	);
	const basePositions = computeBasePositions(tasks);

	const graphTasks = tasks.map((task) => {
		const base = basePositions.get(task.id)!;
		const offset = offsets.get(task.id) ?? { offsetX: 0, offsetY: 0 };
		return {
			...task,
			x: base.x + offset.offsetX,
			y: base.y + offset.offsetY
		};
	});

	return { project, tasks: graphTasks, dependencies };
};

export const actions: Actions = {
	createSuccessor: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const predecessorId = Number(data.get('predecessorId'));
		const projectId = Number(params.id);

		const task = await createTask(db, {
			projectId,
			title: 'New task',
			description: '',
			type: 'task',
			durationDays: 1
		});
		await createDependency(db, projectId, predecessorId, task.id);
	}
};
