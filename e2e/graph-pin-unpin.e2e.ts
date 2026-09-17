import { expect, test } from '@playwright/test';

test('dragging pins a task, and its unpin icon releases it back to autolayout', async ({
	page
}) => {
	const projectName = `E2E Pin ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Draggable task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('tbody tr').filter({ hasText: 'Draggable task' })).toBeVisible();
	await page.getByRole('link', { name: 'Graph', exact: true }).click();

	const node = page.locator('g[data-task-id] rect.node');
	const box = await node.boundingBox();
	if (!box) throw new Error('node not visible');

	// Not yet pinned: hovering shows no unpin icon.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page.locator('g.unpin-button')).toHaveCount(0);

	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 });
	await page.mouse.up();
	// Give the fire-and-forget PATCH a moment to land.
	await page.waitForTimeout(200);

	const draggedBox = await node.boundingBox();
	if (!draggedBox) throw new Error('node not visible after drag');

	// Now pinned: hovering shows the unpin icon.
	await page.mouse.move(draggedBox.x + draggedBox.width / 2, draggedBox.y + draggedBox.height / 2);
	await expect(page.locator('g.unpin-button')).toHaveCount(1);

	await page.locator('g.unpin-button circle').click();
	await expect(page.locator('g.unpin-button')).toHaveCount(0);
	await page.waitForTimeout(200);

	await page.reload();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	const reloadedBox = await page.locator('g[data-task-id] rect.node').boundingBox();
	if (!reloadedBox) throw new Error('node not visible after reload');
	await page.mouse.move(
		reloadedBox.x + reloadedBox.width / 2,
		reloadedBox.y + reloadedBox.height / 2
	);
	await expect(page.locator('g.unpin-button')).toHaveCount(0);
});
