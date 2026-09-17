import { json, type RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db/client';
import { updateTask, reorderTasks, listTasksForProject } from '$lib/server/repositories/tasks';
import { listDependenciesForProject } from '$lib/server/repositories/dependencies';
import { computeDisplaySchedule } from '$lib/server/scheduling/cpm';

type PatchBody =
	| { type: 'duration'; taskId: number; durationDays: number }
	| { type: 'reorder'; orderedIds: number[] }
	| { type: 'title'; taskId: number; title: string }
	| { type: 'delay'; taskId: number; requestedStartOffsetDays: number };

export const PATCH: RequestHandler = async ({ request, params, platform }) => {
	const db = getDb(platform!.env.DB);
	const projectId = Number(params.id);
	const body = (await request.json()) as PatchBody;

	if (body.type === 'reorder') {
		await reorderTasks(db, body.orderedIds);
	} else if (body.type === 'title') {
		const title = body.title.trim();
		if (title !== '') {
			await updateTask(db, body.taskId, { title });
		}
	} else if (body.type === 'duration') {
		await updateTask(db, body.taskId, { durationDays: body.durationDays });
	} else {
		// A dependency arrow only guarantees order (a task can't be shown before
		// its predecessors finish) - it never pins a successor to start the
		// instant they do. So a requested date is clamped up to that floor, never
		// down, and never rejected outright.
		const [tasks, dependencies] = await Promise.all([
			listTasksForProject(db, projectId),
			listDependenciesForProject(db, projectId)
		]);
		const displaySchedule = computeDisplaySchedule(
			tasks.map((t) => ({
				id: t.id,
				durationDays: t.durationDays,
				startDelayDays: t.startDelayDays
			})),
			dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId }))
		);
		const predecessorIds = dependencies
			.filter((d) => d.successorId === body.taskId)
			.map((d) => d.predecessorId);
		const floor =
			predecessorIds.length === 0
				? 0
				: Math.max(...predecessorIds.map((id) => displaySchedule.get(id)!.finish));
		const startDelayDays = Math.max(0, body.requestedStartOffsetDays - floor);
		await updateTask(db, body.taskId, { startDelayDays });
	}

	return json({ ok: true });
};
