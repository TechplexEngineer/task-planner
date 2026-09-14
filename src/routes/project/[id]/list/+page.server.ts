import { fail, type Actions } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import { createTask, updateTask, deleteTask, reorderTasks } from '$lib/server/repositories/tasks';
import {
	createDependency,
	deleteDependency,
	CycleError
} from '$lib/server/repositories/dependencies';

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

	deleteTask: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		await deleteTask(db, Number(data.get('id')));
	},

	createDependency: async ({ request, params, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const predecessorId = Number(data.get('predecessorId'));
		const successorId = Number(data.get('successorId'));
		try {
			await createDependency(db, Number(params.id), predecessorId, successorId);
		} catch (err) {
			if (err instanceof CycleError) {
				return fail(400, { formName: 'createDependency', error: err.message });
			}
			throw err;
		}
	},

	deleteDependency: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		await deleteDependency(db, Number(data.get('id')));
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
