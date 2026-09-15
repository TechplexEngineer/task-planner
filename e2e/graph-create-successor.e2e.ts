import { expect, test } from '@playwright/test';

test('hovering a node and clicking + creates a connected successor', async ({ page }) => {
	const projectName = `E2E Create Successor ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Root task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('link', { name: 'Graph' }).click();

	await expect(page.locator('g[data-task-id]')).toHaveCount(1);

	await page.locator('g[data-task-id] rect.node').hover();
	await page.locator('.add-successor-button').click();

	await expect(page.locator('g[data-task-id]')).toHaveCount(2);
	await expect(page.locator('line.edge')).toHaveCount(1);
});
