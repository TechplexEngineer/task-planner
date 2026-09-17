import type { Actions } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import { updateTask } from '$lib/server/repositories/tasks';

export const actions: Actions = {
	setScheduledDate: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const taskId = Number(data.get('taskId'));
		const date = String(data.get('date') ?? '');
		await updateTask(db, taskId, { scheduledDate: date === '' ? null : date });
	}
};
