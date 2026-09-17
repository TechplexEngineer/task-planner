import { eq, or, and, isNull } from 'drizzle-orm';
import { tasks, dependencies, taskPositions } from '../db/schema';
import type { Db } from '../db/client';

export interface NewTaskInput {
	projectId: number;
	title: string;
	description: string;
	type: 'task' | 'milestone';
	durationDays: number;
	parentId?: number | null;
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
			parentId: input.parentId ?? null,
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
	const children = await db.select().from(tasks).where(eq(tasks.parentId, id)).all();
	for (const child of children) {
		await deleteTask(db, child.id);
	}
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

async function listSiblings(db: Db, projectId: number, parentId: number | null) {
	return db
		.select()
		.from(tasks)
		.where(
			parentId === null
				? and(eq(tasks.projectId, projectId), isNull(tasks.parentId))
				: and(eq(tasks.projectId, projectId), eq(tasks.parentId, parentId))
		)
		.orderBy(tasks.treeRank, tasks.id)
		.all();
}

async function renumberSiblings(db: Db, orderedTaskIds: number[]) {
	for (let i = 0; i < orderedTaskIds.length; i++) {
		await db.update(tasks).set({ treeRank: i }).where(eq(tasks.id, orderedTaskIds[i]));
	}
}

export async function taskHasChildren(db: Db, id: number): Promise<boolean> {
	const child = await db.select().from(tasks).where(eq(tasks.parentId, id)).get();
	return child !== undefined;
}

export async function createChildTask(
	db: Db,
	input: { projectId: number; parentId: number | null; afterTaskId: number | null }
) {
	const task = await createTask(db, {
		projectId: input.projectId,
		title: '',
		description: '',
		type: 'task',
		durationDays: 1,
		parentId: input.parentId
	});
	const siblings = await listSiblings(db, input.projectId, input.parentId);
	const withoutNew = siblings.filter((s) => s.id !== task.id).map((s) => s.id);
	const insertIndex =
		input.afterTaskId === null ? withoutNew.length : withoutNew.indexOf(input.afterTaskId) + 1;
	const ordered = [...withoutNew.slice(0, insertIndex), task.id, ...withoutNew.slice(insertIndex)];
	await renumberSiblings(db, ordered);
	return task;
}

export async function indentTask(db: Db, id: number) {
	const task = await db.select().from(tasks).where(eq(tasks.id, id)).get();
	if (!task) throw new Error(`Task ${id} not found`);
	const siblings = await listSiblings(db, task.projectId, task.parentId);
	const index = siblings.findIndex((s) => s.id === id);
	if (index <= 0) return task;
	const newParent = siblings[index - 1];
	const newSiblings = await listSiblings(db, task.projectId, newParent.id);
	await db.update(tasks).set({ parentId: newParent.id }).where(eq(tasks.id, id));
	await renumberSiblings(db, [...newSiblings.map((s) => s.id), id]);
	return { ...task, parentId: newParent.id };
}

export async function outdentTask(db: Db, id: number) {
	const task = await db.select().from(tasks).where(eq(tasks.id, id)).get();
	if (!task || task.parentId === null) return task;
	const parent = await db.select().from(tasks).where(eq(tasks.id, task.parentId)).get();
	if (!parent) return task;
	const newSiblings = await listSiblings(db, task.projectId, parent.parentId);
	const parentIndex = newSiblings.findIndex((s) => s.id === parent.id);
	const ordered = [
		...newSiblings.slice(0, parentIndex + 1).map((s) => s.id),
		id,
		...newSiblings.slice(parentIndex + 1).map((s) => s.id)
	];
	await db.update(tasks).set({ parentId: parent.parentId }).where(eq(tasks.id, id));
	await renumberSiblings(db, ordered);
	return { ...task, parentId: parent.parentId };
}
