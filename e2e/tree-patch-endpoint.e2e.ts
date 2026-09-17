import { expect, test } from '@playwright/test';

test('tree endpoint creates, indents, outdents, and deletes tasks', async ({ page, request }) => {
	const projectName = `E2E Tree Endpoint ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();
	await page.waitForURL(/\/project\/\d+\//);

	const projectUrl = page.url();
	const projectId = projectUrl.match(/\/project\/(\d+)\//)?.[1];
	if (!projectId) throw new Error('could not extract project id from URL');

	// Create a root task.
	const createRoot = await request.fetch(`/project/${projectId}/tree`, {
		method: 'POST',
		data: { parentId: null, afterTaskId: null }
	});
	expect(createRoot.ok()).toBe(true);
	const rootBody = await createRoot.json();
	const rootId = rootBody.newTaskId;
	expect(rootBody.tasks).toEqual([
		expect.objectContaining({ id: rootId, parentId: null, title: '' })
	]);

	// Create a second root task after the first.
	const createSecond = await request.fetch(`/project/${projectId}/tree`, {
		method: 'POST',
		data: { parentId: null, afterTaskId: rootId }
	});
	const secondBody = await createSecond.json();
	const secondId = secondBody.newTaskId;
	expect(secondBody.tasks.map((t: { id: number }) => t.id)).toEqual([rootId, secondId]);

	// Give the root task a title.
	const titlePatch = await request.fetch(`/project/${projectId}/tree`, {
		method: 'PATCH',
		data: { type: 'title', taskId: rootId, title: 'Epic' }
	});
	expect(await titlePatch.json()).toEqual({ ok: true });

	// Indent the second task under the first.
	const indentPatch = await request.fetch(`/project/${projectId}/tree`, {
		method: 'PATCH',
		data: { type: 'indent', taskId: secondId }
	});
	const indentBody = await indentPatch.json();
	expect(indentBody.tasks.find((t: { id: number }) => t.id === secondId).parentId).toBe(rootId);

	// Deleting the parent while it has a child is rejected.
	const blockedDelete = await request.fetch(`/project/${projectId}/tree`, {
		method: 'DELETE',
		data: { taskId: rootId }
	});
	expect(blockedDelete.status()).toBe(400);

	// Outdent the child back to root.
	const outdentPatch = await request.fetch(`/project/${projectId}/tree`, {
		method: 'PATCH',
		data: { type: 'outdent', taskId: secondId }
	});
	const outdentBody = await outdentPatch.json();
	expect(outdentBody.tasks.find((t: { id: number }) => t.id === secondId).parentId).toBe(null);

	// Now the childless parent can be deleted.
	const okDelete = await request.fetch(`/project/${projectId}/tree`, {
		method: 'DELETE',
		data: { taskId: rootId }
	});
	expect(await okDelete.json()).toEqual({ ok: true });
});
