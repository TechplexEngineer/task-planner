import { expect, test } from '@playwright/test';

test('create, rename, and delete a project', async ({ page }) => {
	const originalName = `E2E Project ${Date.now()}`;
	const renamedName = `${originalName} Renamed`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(originalName);
	await page.getByRole('button', { name: 'Create project' }).click();

	const row = page.locator('li').filter({ hasText: originalName });
	await expect(row).toBeVisible();

	await row.getByLabel('Rename project').fill(renamedName);
	await row.getByRole('button', { name: 'Rename' }).click();
	await expect(page.locator('li').filter({ hasText: renamedName })).toBeVisible();

	await page
		.locator('li')
		.filter({ hasText: renamedName })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page.locator('li').filter({ hasText: renamedName })).not.toBeVisible();
});
