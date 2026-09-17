export interface TreeTaskInput {
	id: number;
	/**
	 * Stable rendering identity, separate from `id`. A task created optimistically
	 * client-side keeps the same `clientKey` for its whole lifetime even after `id`
	 * is swapped from a temporary negative placeholder to the server-assigned id,
	 * so Svelte's keyed each-block never destroys/recreates its DOM node (and loses
	 * focus) during that swap.
	 */
	clientKey: number;
	parentId: number | null;
	treeRank: number;
	title: string;
	type: 'task' | 'milestone';
}

export interface TreeRow {
	id: number;
	clientKey: number;
	parentId: number | null;
	title: string;
	type: 'task' | 'milestone';
	depth: number;
	hasChildren: boolean;
}

export function flattenTree(tasks: TreeTaskInput[], collapsedIds: Set<number>): TreeRow[] {
	const childrenByParent = new Map<number | null, TreeTaskInput[]>();
	for (const task of tasks) {
		const siblings = childrenByParent.get(task.parentId) ?? [];
		siblings.push(task);
		childrenByParent.set(task.parentId, siblings);
	}
	for (const siblings of childrenByParent.values()) {
		siblings.sort((a, b) => a.treeRank - b.treeRank || a.id - b.id);
	}

	const rows: TreeRow[] = [];
	function visit(parentId: number | null, depth: number) {
		for (const task of childrenByParent.get(parentId) ?? []) {
			const hasChildren = (childrenByParent.get(task.id) ?? []).length > 0;
			rows.push({
				id: task.id,
				clientKey: task.clientKey,
				parentId: task.parentId,
				title: task.title,
				type: task.type,
				depth,
				hasChildren
			});
			if (hasChildren && !collapsedIds.has(task.id)) {
				visit(task.id, depth + 1);
			}
		}
	}
	visit(null, 0);
	return rows;
}
