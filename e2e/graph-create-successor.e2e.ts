import { expect, test } from '@playwright/test';

test('hovering a node and clicking + creates a connected successor', async ({ page }) => {
	const projectName = `E2E Create Successor ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Root task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	// Wait for the task's use:enhance submission (and its invalidateAll) to settle
	// before navigating away - otherwise the still-in-flight form action can win a
	// race against the Graph link's navigation and leave us on the List view.
	await expect(page.locator('tbody tr').filter({ hasText: 'Root task' })).toBeVisible();
	await page.getByRole('link', { name: 'Graph', exact: true }).click();

	await expect(page.locator('g[data-task-id]')).toHaveCount(1);

	await page.locator('g[data-task-id] rect.node').hover();
	await page.locator('.add-successor-button').click();

	await expect(page.locator('g[data-task-id]')).toHaveCount(2);
	await expect(page.locator('line.edge')).toHaveCount(1);
});
