import { eq, or } from 'drizzle-orm';
import { tasks, dependencies, taskPositions } from '../db/schema';
import type { Db } from '../db/client';

export interface NewTaskInput {
	projectId: number;
	title: string;
	description: string;
	type: 'task' | 'milestone';
	durationDays: number;
}

export interface TaskPatch {
	title?: string;
	description?: string;
	type?: 'task' | 'milestone';
	durationDays?: number;
	status?: 'todo' | 'in_progress' | 'done';
	scheduledDate?: string | null;
}

export async function listTasksForProject(db: Db, projectId: number) {
	return db
		.select()
		.from(tasks)
		.where(eq(tasks.projectId, projectId))
		.orderBy(tasks.priorityRank, tasks.id)
		.all();
}

export async function createTask(db: Db, input: NewTaskInput) {
	const existing = await listTasksForProject(db, input.projectId);
	const nextRank = existing.length === 0 ? 1 : Math.max(...existing.map((t) => t.priorityRank)) + 1;
	const createdAt = new Date().toISOString();
	const durationDays = input.type === 'milestone' ? 0 : input.durationDays;
	const [task] = await db
		.insert(tasks)
		.values({
			projectId: input.projectId,
			title: input.title,
			description: input.description,
			type: input.type,
			durationDays,
			status: 'todo',
			priorityRank: nextRank,
			createdAt
		})
		.returning();
	return task;
}

export async function updateTask(db: Db, id: number, patch: TaskPatch) {
	const value = { ...patch };
	if (value.type === 'milestone') {
		value.durationDays = 0;
	} else if (value.type === undefined && value.durationDays !== undefined) {
		// The patch doesn't say what type this task is, but it might already be a
		// milestone in the database — the milestone-implies-zero-duration invariant
		// must hold regardless of which fields a given caller happens to patch.
		const current = await db.select().from(tasks).where(eq(tasks.id, id)).get();
		if (current?.type === 'milestone') value.durationDays = 0;
	}
	await db.update(tasks).set(value).where(eq(tasks.id, id));
}

export async function deleteTask(db: Db, id: number) {
	await db
		.delete(dependencies)
		.where(or(eq(dependencies.predecessorId, id), eq(dependencies.successorId, id)));
	await db.delete(taskPositions).where(eq(taskPositions.taskId, id));
	await db.delete(tasks).where(eq(tasks.id, id));
}

export async function reorderTasks(db: Db, orderedTaskIds: number[]) {
	for (let i = 0; i < orderedTaskIds.length; i++) {
		await db
			.update(tasks)
			.set({ priorityRank: i + 1 })
			.where(eq(tasks.id, orderedTaskIds[i]));
	}
}
