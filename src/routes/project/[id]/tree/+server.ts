import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import {
	createChildTask,
	indentTask,
	outdentTask,
	updateTask,
	deleteTask,
	taskHasChildren,
	listTasksForProject
} from '$lib/server/repositories/tasks';

type PostBody = { parentId: number | null; afterTaskId: number | null };
type PatchBody =
	| { type: 'title'; taskId: number; title: string }
	| { type: 'indent'; taskId: number }
	| { type: 'outdent'; taskId: number };
type DeleteBody = { taskId: number };

async function treeTasksFor(projectId: number, db: ReturnType<typeof getDb>) {
	const tasks = await listTasksForProject(db, projectId);
	return tasks.map((t) => ({
		id: t.id,
		parentId: t.parentId,
		treeRank: t.treeRank,
		title: t.title,
		type: t.type
	}));
}

export const POST: RequestHandler = async ({ request, params, platform }) => {
	const db = getDb(platform!.env.DB);
	const projectId = Number(params.id);
	const body = (await request.json()) as PostBody;
	const task = await createChildTask(db, {
		projectId,
		parentId: body.parentId,
		afterTaskId: body.afterTaskId
	});
	return json({ newTaskId: task.id, tasks: await treeTasksFor(projectId, db) });
};

export const PATCH: RequestHandler = async ({ request, params, platform }) => {
	const db = getDb(platform!.env.DB);
	const projectId = Number(params.id);
	const body = (await request.json()) as PatchBody;

	if (body.type === 'title') {
		await updateTask(db, body.taskId, { title: body.title });
		return json({ ok: true });
	}

	if (body.type === 'indent') {
		await indentTask(db, body.taskId);
	} else {
		await outdentTask(db, body.taskId);
	}
	return json({ tasks: await treeTasksFor(projectId, db) });
};

export const DELETE: RequestHandler = async ({ request, platform }) => {
	const db = getDb(platform!.env.DB);
	const body = (await request.json()) as DeleteBody;
	if (await taskHasChildren(db, body.taskId)) {
		return json({ ok: false, error: 'Cannot delete a task that has children' }, { status: 400 });
	}
	await deleteTask(db, body.taskId);
	return json({ ok: true });
};
