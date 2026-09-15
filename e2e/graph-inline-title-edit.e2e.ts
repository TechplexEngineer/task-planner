import { expect, test } from '@playwright/test';

test('editing a title inline persists across reload', async ({ page }) => {
	const projectName = `E2E Title Edit ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Original title');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('link', { name: 'Graph' }).click();

	await page.locator('g[data-task-id] rect.node').dblclick();
	const input = page.locator('.title-input');
	await input.fill('Renamed title');
	await input.blur();

	await page.waitForTimeout(200);
	await page.reload();

	await expect(page.locator('g[data-task-id] text').filter({ hasText: 'Renamed title' })).toBeVisible();
});
