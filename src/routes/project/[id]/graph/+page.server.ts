import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import type { Db } from '$lib/server/db/client';
import { listPositionsForTasks, resetPosition } from '$lib/server/repositories/positions';
import { computeBasePositions } from '$lib/graph-layout';
import { createTask, listTasksForProject, deleteTask as deleteTaskRow } from '$lib/server/repositories/tasks';
import {
	createDependency as createDependencyEdge,
	deleteDependency as deleteDependencyRow,
	listDependenciesForProject,
	CycleError
} from '$lib/server/repositories/dependencies';
import { computeLayers } from '$lib/server/scheduling/layout';
import { taskIdsWithChangedLayer } from '$lib/server/scheduling/offset-reset';

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

async function currentLayers(db: Db, projectId: number) {
	const tasks = await listTasksForProject(db, projectId);
	const dependencies = await listDependenciesForProject(db, projectId);
	return computeLayers(
		tasks.map((t) => t.id),
		dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId }))
	);
}

async function resetOffsetsForChangedLayers(
	db: Db,
	projectId: number,
	before: Map<number, number>
) {
	const after = await currentLayers(db, projectId);
	for (const taskId of taskIdsWithChangedLayer(before, after)) {
		await resetPosition(db, taskId);
	}
}

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
