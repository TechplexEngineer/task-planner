import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import { listPositionsForTasks } from '$lib/server/repositories/positions';
import { computeBasePositions, type Point } from '$lib/graph-layout';
import { computeAutoLayout } from '$lib/graph-autolayout';
import { createTask, deleteTask as deleteTaskRow } from '$lib/server/repositories/tasks';
import {
	createDependency as createDependencyEdge,
	deleteDependency as deleteDependencyRow,
	CycleError
} from '$lib/server/repositories/dependencies';
import { currentLayers, resetOffsetsForChangedLayers } from '$lib/server/scheduling/offset-reset';

export const load: PageServerLoad = async ({ parent, platform }) => {
	const { project, tasks, dependencies } = await parent();
	const db = getDb(platform!.env.DB);
	const offsets = await listPositionsForTasks(
		db,
		tasks.map((t) => t.id)
	);
	const basePositions = computeBasePositions(tasks);

	const pinnedPositions = new Map<number, Point>();
	for (const task of tasks) {
		const offset = offsets.get(task.id);
		if (!offset) continue;
		const base = basePositions.get(task.id)!;
		pinnedPositions.set(task.id, { x: base.x + offset.offsetX, y: base.y + offset.offsetY });
	}
	const layout = computeAutoLayout(tasks, dependencies, pinnedPositions);

	const graphTasks = tasks.map((task) => {
		const position = layout.get(task.id)!;
		return {
			...task,
			x: position.x,
			y: position.y,
			pinned: pinnedPositions.has(task.id)
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
		await createDependencyEdge(db, projectId, predecessorId, task.id);
	},

	createDependency: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const predecessorId = Number(data.get('predecessorId'));
		const successorId = Number(data.get('successorId'));
		const projectId = Number(params.id);

		const before = await currentLayers(db, projectId);
		try {
			await createDependencyEdge(db, projectId, predecessorId, successorId);
		} catch (err) {
			if (err instanceof CycleError) {
				return fail(400, { formName: 'createDependency', error: err.message });
			}
			throw err;
		}
		await resetOffsetsForChangedLayers(db, projectId, before);
	},

	deleteTask: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const projectId = Number(params.id);
		const before = await currentLayers(db, projectId);
		await deleteTaskRow(db, Number(data.get('id')));
		await resetOffsetsForChangedLayers(db, projectId, before);
	},

	deleteDependency: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const projectId = Number(params.id);
		const before = await currentLayers(db, projectId);
		await deleteDependencyRow(db, Number(data.get('id')));
		await resetOffsetsForChangedLayers(db, projectId, before);
	}
};
