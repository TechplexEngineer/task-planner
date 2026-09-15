import type { Db } from '../db/client';
import { listTasksForProject } from '../repositories/tasks';
import { listDependenciesForProject } from '../repositories/dependencies';
import { resetPosition } from '../repositories/positions';
import { computeLayers } from './layout';

export function taskIdsWithChangedLayer(
	before: Map<number, number>,
	after: Map<number, number>
): number[] {
	const changed: number[] = [];
	for (const [id, afterLayer] of after) {
		const beforeLayer = before.get(id);
		if (beforeLayer !== undefined && beforeLayer !== afterLayer) {
			changed.push(id);
		}
	}
	return changed;
}

export async function currentLayers(db: Db, projectId: number): Promise<Map<number, number>> {
	const tasks = await listTasksForProject(db, projectId);
	const dependencies = await listDependenciesForProject(db, projectId);
	return computeLayers(
		tasks.map((t) => t.id),
		dependencies.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId }))
	);
}

export async function resetOffsetsForChangedLayers(
	db: Db,
	projectId: number,
	before: Map<number, number>
): Promise<void> {
	const after = await currentLayers(db, projectId);
	for (const taskId of taskIdsWithChangedLayer(before, after)) {
		await resetPosition(db, taskId);
	}
}
