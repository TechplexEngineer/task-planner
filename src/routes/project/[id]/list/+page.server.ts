import { fail, type Actions } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import { createTask, updateTask, deleteTask, reorderTasks } from '$lib/server/repositories/tasks';
import {
	createDependency,
	deleteDependency,
	CycleError
} from '$lib/server/repositories/dependencies';
import { currentLayers, resetOffsetsForChangedLayers } from '$lib/server/scheduling/offset-reset';

export const actions: Actions = {
	createTask: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const title = data.get('title');
		if (typeof title !== 'string' || title.trim() === '') {
			return fail(400, { formName: 'createTask', error: 'Title is required' });
		}
		const type = data.get('type') === 'milestone' ? 'milestone' : 'task';
		const durationDays = Number(data.get('durationDays') ?? 1);
		await createTask(db, {
			projectId: Number(params.id),
			title: title.trim(),
			description: String(data.get('description') ?? ''),
			type,
			durationDays: type === 'milestone' ? 0 : durationDays
		});
	},

	updateTask: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const id = Number(data.get('id'));
		const status = data.get('status');
		const durationDays = data.get('durationDays');
		await updateTask(db, id, {
			...(typeof status === 'string' ? { status: status as 'todo' | 'in_progress' | 'done' } : {}),
			...(durationDays !== null ? { durationDays: Number(durationDays) } : {})
		});
	},

	deleteTask: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const projectId = Number(params.id);
		const before = await currentLayers(db, projectId);
		await deleteTask(db, Number(data.get('id')));
		await resetOffsetsForChangedLayers(db, projectId, before);
	},

	createDependency: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const predecessorId = Number(data.get('predecessorId'));
		const successorId = Number(data.get('successorId'));
		const projectId = Number(params.id);
		const before = await currentLayers(db, projectId);
		try {
			await createDependency(db, projectId, predecessorId, successorId);
		} catch (err) {
			if (err instanceof CycleError) {
				return fail(400, { formName: 'createDependency', error: err.message });
			}
			throw err;
		}
		await resetOffsetsForChangedLayers(db, projectId, before);
	},

	deleteDependency: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const projectId = Number(params.id);
		const before = await currentLayers(db, projectId);
		await deleteDependency(db, Number(data.get('id')));
		await resetOffsetsForChangedLayers(db, projectId, before);
	},

	importTasks: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const projectId = Number(params.id);
		const titles = String(data.get('lines') ?? '')
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line !== '');
		if (titles.length === 0) {
			return fail(400, { formName: 'importTasks', error: 'Enter at least one task' });
		}

		const before = await currentLayers(db, projectId);
		let previousTask: { id: number } | undefined;
		for (const title of titles) {
			const task = await createTask(db, {
				projectId,
				title,
				description: '',
				type: 'task',
				durationDays: 1
			});
			if (previousTask) {
				await createDependency(db, projectId, previousTask.id, task.id);
			}
			previousTask = task;
		}
		await resetOffsetsForChangedLayers(db, projectId, before);
	},

	reorder: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const orderedIds = String(data.get('orderedIds') ?? '')
			.split(',')
			.filter(Boolean)
			.map(Number);
		await reorderTasks(db, orderedIds);
	}
};
