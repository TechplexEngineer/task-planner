import { eq } from 'drizzle-orm';
import { dependencies } from '../db/schema';
import type { Db } from '../db/client';
import { wouldCreateCycle } from '../scheduling/cycle-detection';

export class CycleError extends Error {
	constructor() {
		super('This dependency would create a cycle');
	}
}

export async function listDependenciesForProject(db: Db, projectId: number) {
	return db.select().from(dependencies).where(eq(dependencies.projectId, projectId)).all();
}

export async function createDependency(
	db: Db,
	projectId: number,
	predecessorId: number,
	successorId: number
) {
	const existing = await listDependenciesForProject(db, projectId);
	const existingEdges = existing.map((e) => ({
		predecessorId: e.predecessorId,
		successorId: e.successorId
	}));
	if (wouldCreateCycle(existingEdges, { predecessorId, successorId })) {
		throw new CycleError();
	}
	const [dependency] = await db
		.insert(dependencies)
		.values({ projectId, predecessorId, successorId })
		.returning();
	return dependency;
}

export async function deleteDependency(db: Db, id: number) {
	await db.delete(dependencies).where(eq(dependencies.id, id));
}
