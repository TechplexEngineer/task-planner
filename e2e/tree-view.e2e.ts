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

test('rapid successive Enter presses each create a correct, uncorrupted row', async ({ page }) => {
	// Regression test: typing a title and pressing Enter immediately, back-to-back,
	// used to race the server round-trip from the previous row's creation and garble
	// or drop titles. Rows must now be created optimistically so fast bulk entry works.
	const projectName = `E2E Tree Rapid Entry ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();
	await page.waitForURL(/\/project\/\d+\//);

	await page.getByRole('link', { name: 'Tree' }).click();
	await expect(page.locator('h2', { hasText: 'Tree' })).toBeVisible();

	await page.getByRole('button', { name: '+ New task' }).click();

	for (let i = 1; i <= 5; i++) {
		const focused = page.locator(':focus');
		await focused.type(`Task ${i}`, { delay: 10 });
		await focused.press('Enter');
	}

	const titleValues = () =>
		page.locator('.title-input').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
	const expectedTitles = ['Task 1', 'Task 2', 'Task 3', 'Task 4', 'Task 5', ''];

	const rows = page.locator('.tree-row');
	await expect(rows).toHaveCount(6);
	await expect.poll(titleValues).toEqual(expectedTitles);

	// Titles are correctly persisted server-side too, not just in the optimistic UI.
	// (The rows are created optimistically in the UI before the server confirms each
	// one in the background, so give that background traffic time to settle before
	// reloading - otherwise reloading could race an in-flight creation request, same
	// as a real user reloading mid-save would. `networkidle` is unreliable here since
	// the requests are issued one at a time from an in-page queue with real gaps
	// between them, so it can report idle before the later ones are even sent.)
	await page.waitForTimeout(3000);
	await page.reload();
	await expect(page.locator('.tree-row')).toHaveCount(6);
	await expect.poll(titleValues).toEqual(expectedTitles);
});
