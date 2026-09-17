import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { project, tasks } = await parent();
	return {
		project,
		tasks: tasks.map((t) => ({
			id: t.id,
			parentId: t.parentId,
			treeRank: t.treeRank,
			title: t.title,
			type: t.type
		}))
	};
};
