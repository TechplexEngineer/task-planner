import { expect, test } from '@playwright/test';

test('dragging a node persists its position across reload', async ({ page }) => {
	const projectName = `E2E Drag ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Draggable task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	// Wait for the task's use:enhance submission (and its invalidateAll) to settle
	// before navigating away - otherwise the still-in-flight form action can win a
	// race against the Graph link's navigation and leave us on the List view.
	await expect(page.locator('li').filter({ hasText: 'Draggable task' })).toBeVisible();
	await page.getByRole('link', { name: 'Graph' }).click();

	const node = page.locator('g[data-task-id] rect.node');
	const box = await node.boundingBox();
	if (!box) throw new Error('node not visible');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 });
	await page.mouse.up();

	// Give the fire-and-forget PATCH a moment to land before reloading.
	await page.waitForTimeout(200);
	await page.reload();

	const reloadedBox = await page.locator('g[data-task-id] rect.node').boundingBox();
	if (!reloadedBox) throw new Error('node not visible after reload');
	expect(Math.abs(reloadedBox.x - box.x)).toBeGreaterThan(30);
});
