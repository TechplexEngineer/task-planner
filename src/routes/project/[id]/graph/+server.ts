import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import { upsertPosition } from '$lib/server/repositories/positions';
import { updateTask, listTasksForProject, type TaskPatch } from '$lib/server/repositories/tasks';
import { listDependenciesForProject } from '$lib/server/repositories/dependencies';
import { computeSchedule } from '$lib/server/scheduling/cpm';

type PatchBody =
	| { type: 'position'; taskId: number; offsetX: number; offsetY: number }
	| { type: 'fields'; taskId: number; patch: TaskPatch };

export const PATCH: RequestHandler = async ({ request, params, platform }) => {
	const db = getDb(platform!.env.DB);
	const projectId = Number(params.id);
	const body = (await request.json()) as PatchBody;

	if (body.type === 'position') {
		await upsertPosition(db, body.taskId, body.offsetX, body.offsetY);
		return json({ ok: true });
	}

	await updateTask(db, body.taskId, body.patch);
	const tasks = await listTasksForProject(db, projectId);
	const dependencies = await listDependenciesForProject(db, projectId);
	const schedule = computeSchedule(
		tasks.map((t) => ({ id: t.id, durationDays: t.durationDays })),
		dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId }))
	);
	return json({
		ok: true,
		tasks: tasks.map((t) => ({ id: t.id, schedule: schedule.get(t.id)! }))
	});
};
