import { expect, test } from '@playwright/test';

test('Enter, Tab, and Shift+Tab build a nested tree by keyboard', async ({ page }) => {
	const projectName = `E2E Tree ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();
	await page.waitForURL(/\/project\/\d+\//);

	await page.getByRole('link', { name: 'Tree' }).click();
	await expect(page.locator('h2', { hasText: 'Tree' })).toBeVisible();

	// Empty tree: only the "+ New task" button is present.
	await page.getByRole('button', { name: '+ New task' }).click();
	const firstInput = page.locator('.title-input').first();
	await expect(firstInput).toBeFocused();
	await firstInput.fill('Epic');

	// Enter creates a sibling below, at the same depth.
	await firstInput.press('Enter');
	const rows = page.locator('.tree-row');
	await expect(rows).toHaveCount(2);
	const secondInput = rows.nth(1).locator('.title-input');
	await expect(secondInput).toBeFocused();
	await secondInput.fill('Story');

	// Tab indents "Story" under "Epic".
	await secondInput.press('Tab');
	await expect(rows.nth(1)).toHaveCSS('padding-left', '20px');

	// A chevron now appears on "Epic", and it can collapse/expand its child.
	const epicRow = rows.nth(0);
	await epicRow.getByRole('button', { name: 'Collapse' }).click();
	await expect(rows).toHaveCount(1);
	await epicRow.getByRole('button', { name: 'Expand' }).click();
	await expect(rows).toHaveCount(2);

	// Shift+Tab outdents "Story" back to root.
	await rows.nth(1).locator('.title-input').press('Shift+Tab');
	await expect(rows.nth(1)).toHaveCSS('padding-left', '0px');

	// Backspace on an empty row deletes it and refocuses the previous row.
	await rows.nth(1).locator('.title-input').fill('');
	await rows.nth(1).locator('.title-input').press('Backspace');
	await expect(rows).toHaveCount(1);
	await expect(rows.nth(0).locator('.title-input')).toBeFocused();

	// The title survives a reload (persisted via the PATCH endpoint).
	await page.reload();
	await expect(page.locator('.title-input')).toHaveValue('Epic');
});
