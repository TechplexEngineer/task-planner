import { fail, type Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db/client';
import {
	createProject,
	deleteProject,
	listProjects,
	renameProject
} from '$lib/server/repositories/projects';

export const load: PageServerLoad = async ({ platform }) => {
	const db = getDb(platform!.env.DB);
	const projects = await listProjects(db);
	return { projects };
};

export const actions: Actions = {
	create: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const name = data.get('name');
		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { error: 'Project name is required' });
		}
		await createProject(db, name.trim());
	},
	rename: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const id = Number(data.get('id'));
		const name = data.get('name');
		if (typeof name !== 'string' || name.trim() === '') {
			return fail(400, { error: 'Project name is required' });
		}
		await renameProject(db, id, name.trim());
	},
	delete: async ({ request, platform }) => {
		const db = getDb(platform!.env.DB);
		const data = await request.formData();
		const id = Number(data.get('id'));
		await deleteProject(db, id);
	}
};
