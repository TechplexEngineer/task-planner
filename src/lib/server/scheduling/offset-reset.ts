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
