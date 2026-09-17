import { expect, test } from '@playwright/test';

test('dragging a Gantt row reorders tasks and persists across reload', async ({ page }) => {
	const projectName = `E2E Gantt Reorder ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Task A');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Task A' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('Task B');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Task B' })).toBeVisible();

	await page.getByRole('link', { name: 'Gantt' }).click();
	await expect(page.locator('h2', { hasText: 'Gantt' })).toBeVisible();

	const rowA = page.locator('.wx-row').filter({ hasText: 'Task A' });
	const rowB = page.locator('.wx-row').filter({ hasText: 'Task B' });
	const boxA = await rowA.boundingBox();
	const boxB = await rowB.boundingBox();
	if (!boxA || !boxB) throw new Error('gantt rows not visible');

	await page.mouse.move(boxA.x + boxA.width / 2, boxA.y + boxA.height / 2);
	await page.mouse.down();
	await page.mouse.move(boxB.x + boxB.width / 2, boxB.y + boxB.height + 5, { steps: 5 });
	await page.mouse.up();

	// Give the fire-and-forget PATCH a moment to land before reloading.
	await page.waitForTimeout(200);
	await page.reload();

	await page.getByRole('link', { name: 'List' }).click();
	const titles = await page.locator('li strong').allTextContents();
	expect(titles.indexOf('Task B')).toBeLessThan(titles.indexOf('Task A'));
});
