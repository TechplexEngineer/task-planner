import { expect, test } from '@playwright/test';

test('graph view renders tasks and dependency edges', async ({ page }) => {
	const projectName = `E2E Graph ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Buy bread');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Buy bread' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('Spread peanut butter');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Spread peanut butter' })).toBeVisible();

	const predecessorSelect = page.locator('select[name="predecessorId"]');
	const successorSelect = page.locator('select[name="successorId"]');
	await predecessorSelect.selectOption({ label: 'Buy bread' });
	await successorSelect.selectOption({ label: 'Spread peanut butter' });
	await page.getByRole('button', { name: 'Add dependency' }).click();

	await page.getByRole('link', { name: 'Graph' }).click();
	await expect(page.locator('svg.graph-canvas')).toBeVisible();
	await expect(page.locator('g[data-task-id] text').filter({ hasText: 'Buy bread' })).toBeVisible();
	await expect(
		page.locator('g[data-task-id] text').filter({ hasText: 'Spread peanut butter' })
	).toBeVisible();
	await expect(page.locator('line.edge')).toHaveCount(1);
});
