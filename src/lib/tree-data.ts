export interface TreeTaskInput {
	id: number;
	parentId: number | null;
	treeRank: number;
	title: string;
	type: 'task' | 'milestone';
}

export interface TreeRow {
	id: number;
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
