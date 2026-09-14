import { eq, inArray } from 'drizzle-orm';
import { projects, tasks, dependencies, taskPositions } from '../db/schema';
import type { Db } from '../db/client';

export async function listProjects(db: Db) {
	return db.select().from(projects).all();
}

export async function getProject(db: Db, id: number) {
	return db.select().from(projects).where(eq(projects.id, id)).get();
}

export async function createProject(db: Db, name: string) {
	const startDate = new Date().toISOString().slice(0, 10);
	const createdAt = new Date().toISOString();
	const [project] = await db.insert(projects).values({ name, startDate, createdAt }).returning();
	return project;
}

export async function renameProject(db: Db, id: number, name: string) {
	await db.update(projects).set({ name }).where(eq(projects.id, id));
}

export async function deleteProject(db: Db, id: number) {
	const projectTasks = await db
		.select({ id: tasks.id })
		.from(tasks)
		.where(eq(tasks.projectId, id))
		.all();
	const taskIds = projectTasks.map((t) => t.id);

	await db.delete(dependencies).where(eq(dependencies.projectId, id));
	if (taskIds.length > 0) {
		await db.delete(taskPositions).where(inArray(taskPositions.taskId, taskIds));
	}
	await db.delete(tasks).where(eq(tasks.projectId, id));
	await db.delete(projects).where(eq(projects.id, id));
}
