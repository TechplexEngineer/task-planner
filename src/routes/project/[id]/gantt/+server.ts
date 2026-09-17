import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import { updateTask, reorderTasks } from '$lib/server/repositories/tasks';

type PatchBody =
	| { type: 'duration'; taskId: number; durationDays: number }
	| { type: 'reorder'; orderedIds: number[] };

export const PATCH: RequestHandler = async ({ request, platform }) => {
	const db = getDb(platform!.env.DB);
	const body = (await request.json()) as PatchBody;

	if (body.type === 'reorder') {
		await reorderTasks(db, body.orderedIds);
	} else {
		await updateTask(db, body.taskId, { durationDays: body.durationDays });
	}

	return json({ ok: true });
};
