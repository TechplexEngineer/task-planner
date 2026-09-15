import { eq, inArray } from 'drizzle-orm';
import { taskPositions } from '../db/schema';
import type { Db } from '../db/client';

export interface TaskOffset {
	offsetX: number;
	offsetY: number;
}

export async function listPositionsForTasks(
	db: Db,
	taskIds: number[]
): Promise<Map<number, TaskOffset>> {
	const offsets = new Map<number, TaskOffset>();
	if (taskIds.length === 0) return offsets;
	const rows = await db
		.select()
		.from(taskPositions)
		.where(inArray(taskPositions.taskId, taskIds))
		.all();
	for (const row of rows) {
		offsets.set(row.taskId, { offsetX: row.offsetX, offsetY: row.offsetY });
	}
	return offsets;
}

export async function upsertPosition(
	db: Db,
	taskId: number,
	offsetX: number,
	offsetY: number
): Promise<void> {
	await db
		.insert(taskPositions)
		.values({ taskId, offsetX, offsetY })
		.onConflictDoUpdate({ target: taskPositions.taskId, set: { offsetX, offsetY } });
}

export async function resetPosition(db: Db, taskId: number): Promise<void> {
	await db.delete(taskPositions).where(eq(taskPositions.taskId, taskId));
}
