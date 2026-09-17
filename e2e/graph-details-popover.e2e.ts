import { expect, test } from '@playwright/test';

test('editing duration in the popover updates the critical-path highlight without a reload', async ({
	page
}) => {
	const projectName = `E2E Popover ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	// Two independent (unconnected) tasks: CPM gives the longer one zero slack (critical)
	// and the shorter one positive slack (not critical), since each is its own sink node.
	await page.getByPlaceholder('Title').fill('Short branch');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	// Wait for the list to reflect the first task before typing the second: use:enhance's
	// default form.reset() (fired once the first submission resolves) would otherwise race
	// with filling the still-attached Title input for the second task and wipe it.
	await expect(page.locator('tbody tr').filter({ hasText: 'Short branch' })).toBeVisible();
	await page.getByPlaceholder('Title').fill('Long branch');
	await page.locator('input[name="durationDays"]').fill('5');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('tbody tr').filter({ hasText: 'Long branch' })).toBeVisible();
	await page.getByRole('link', { name: 'Graph', exact: true }).click();

	const nodes = page.locator('g[data-task-id]');
	// "Long branch" (created second, duration 5) starts as the sole critical-path node.
	await expect(nodes.nth(1).locator('rect.node.critical')).toBeVisible();
	await expect(nodes.first().locator('rect.node.critical')).toHaveCount(0);

	await nodes.first().locator('rect.node').dblclick();
	const durationInput = page.locator('.details-popover input[type="number"]');
	await expect(durationInput).toBeVisible();
	await durationInput.fill('10');
	await durationInput.dispatchEvent('change');

	// "Short branch" is now the longer chain and should become critical, without a page reload.
	await expect(nodes.first().locator('rect.node.critical')).toBeVisible();
	await expect(nodes.nth(1).locator('rect.node.critical')).toHaveCount(0);
});
