import { expect, test } from '@playwright/test';

test('PATCH endpoint updates position and fields', async ({ page, request }) => {
	const projectName = `E2E Patch ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Solo task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	const projectUrl = page.url();
	const projectId = projectUrl.match(/\/project\/(\d+)\//)?.[1];
	if (!projectId) throw new Error('could not extract project id from URL');

	const taskIdInput = await page
		.locator('li')
		.filter({ hasText: 'Solo task' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');
	const taskId = Number(taskIdInput);

	const positionResponse = await request.fetch(`/project/${projectId}/graph`, {
		method: 'PATCH',
		data: { type: 'position', taskId, offsetX: 42, offsetY: 7 }
	});
	expect(positionResponse.ok()).toBe(true);
	expect(await positionResponse.json()).toEqual({ ok: true });

	const fieldsResponse = await request.fetch(`/project/${projectId}/graph`, {
		method: 'PATCH',
		data: { type: 'fields', taskId, patch: { durationDays: 5 } }
	});
	expect(fieldsResponse.ok()).toBe(true);
	const fieldsBody = await fieldsResponse.json();
	expect(fieldsBody.ok).toBe(true);
	expect(
		fieldsBody.tasks.find((t: { id: number }) => t.id === taskId).schedule.earliestFinish
	).toBe(5);
});
