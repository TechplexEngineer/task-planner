import { expect, test } from '@playwright/test';

test('editing a title inline persists across reload', async ({ page }) => {
	const projectName = `E2E Title Edit ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Original title');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	// Wait for the task's use:enhance submission (and its invalidateAll) to settle
	// before navigating away - otherwise the still-in-flight form action can win a
	// race against the Graph link's navigation and leave us on the List view.
	await expect(page.locator('tbody tr').filter({ hasText: 'Original title' })).toBeVisible();
	await page.getByRole('link', { name: 'Graph', exact: true }).click();

	await page.locator('g[data-task-id] rect.node').click();
	const input = page.locator('.title-input');
	await expect(input).toBeFocused();
	await input.fill('Renamed title');
	await input.blur();

	await page.waitForTimeout(200);
	await page.reload();

	await expect(
		page.locator('g[data-task-id] text').filter({ hasText: 'Renamed title' })
	).toBeVisible();
});
