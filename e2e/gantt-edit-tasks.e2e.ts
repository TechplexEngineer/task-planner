import { expect, test } from '@playwright/test';

test('renames a task and gives it a later start date from the Gantt view', async ({ page }) => {
	const projectName = `E2E Gantt Edit ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Bake bread');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('tbody tr').filter({ hasText: 'Bake bread' })).toBeVisible();

	await page.getByRole('link', { name: 'Gantt' }).click();
	await expect(page.locator('h2', { hasText: 'Gantt' })).toBeVisible();

	const row = page.locator('.wx-row').filter({ hasText: 'Bake bread' });
	const taskCell = row.locator('.wx-cell').first();
	await taskCell.dblclick();

	const titleInput = page.locator('input.wx-text');
	await titleInput.fill('Bake sourdough');
	const renamePatch = page.waitForResponse(
		(res) => res.request().method() === 'PATCH' && res.url().includes('/gantt')
	);
	await titleInput.press('Enter');
	await renamePatch;
	await expect(page.locator('.wx-bar.wx-task').filter({ hasText: 'Bake sourdough' })).toBeVisible();

	// Change its start date via the grid's "Start" column - a few days after its
	// current (earliest-possible) date - proving a dependency-free task isn't
	// pinned to that date either.
	const renamedRow = page.locator('.wx-row').filter({ hasText: 'Bake sourdough' });
	const startCell = renamedRow.locator('.wx-cell').nth(1);
	await startCell.dblclick();

	const selectedDay = page.locator('.wx-day.wx-selected');
	const currentDayId = Number(await selectedDay.getAttribute('data-id'));
	const targetDayId = currentDayId + 3 * 24 * 60 * 60 * 1000;

	const delayPatch = page.waitForResponse(
		(res) => res.request().method() === 'PATCH' && res.url().includes('/gantt')
	);
	await page.locator(`.wx-day[data-id="${targetDayId}"]`).click();
	await delayPatch;

	await page.reload();
	await expect(page.locator('h2', { hasText: 'Gantt' })).toBeVisible();
	await expect(page.locator('.wx-bar.wx-task').filter({ hasText: 'Bake sourdough' })).toBeVisible();
	const newSelectedDay = page
		.locator('.wx-row')
		.filter({ hasText: 'Bake sourdough' })
		.locator('.wx-cell')
		.nth(1);
	await newSelectedDay.dblclick();
	await expect(page.locator('.wx-day.wx-selected')).toHaveAttribute('data-id', String(targetDayId));
});

test('keeps a dependent task from starting before its predecessor finishes, even when asked for an earlier date', async ({
	page
}) => {
	const projectName = `E2E Gantt Order ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Buy bread');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('tbody tr').filter({ hasText: 'Buy bread' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('Spread peanut butter');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('tbody tr').filter({ hasText: 'Spread peanut butter' })).toBeVisible();

	await page.locator('select[name="predecessorId"]').selectOption({ label: 'Buy bread' });
	await page.locator('select[name="successorId"]').selectOption({ label: 'Spread peanut butter' });
	await page.getByRole('button', { name: 'Add dependency' }).click();
	await expect(
		page.locator('li').filter({ hasText: 'Buy bread → Spread peanut butter' })
	).toBeVisible();

	await page.getByRole('link', { name: 'Gantt' }).click();
	await expect(page.locator('h2', { hasText: 'Gantt' })).toBeVisible();

	const successorRow = page.locator('.wx-row').filter({ hasText: 'Spread peanut butter' });
	const startCell = successorRow.locator('.wx-cell').nth(1);
	await startCell.dblclick();

	// Its earliest legal date (the predecessor's finish) is already selected by
	// default. Ask for the day before that anyway - the server must clamp the
	// request back up to the floor rather than honoring it, since a dependency
	// only guarantees order, but order still can't be violated.
	const selectedDay = page.locator('.wx-day.wx-selected');
	const earliestLegalDayId = Number(await selectedDay.getAttribute('data-id'));
	const dayBeforeId = earliestLegalDayId - 24 * 60 * 60 * 1000;

	const clampedPatch = page.waitForResponse(
		(res) => res.request().method() === 'PATCH' && res.url().includes('/gantt')
	);
	await page.locator(`.wx-day[data-id="${dayBeforeId}"]`).click();
	await clampedPatch;

	await page.reload();
	await expect(page.locator('h2', { hasText: 'Gantt' })).toBeVisible();
	const reopenedRow = page.locator('.wx-row').filter({ hasText: 'Spread peanut butter' });
	await reopenedRow.locator('.wx-cell').nth(1).dblclick();
	await expect(page.locator('.wx-day.wx-selected')).toHaveAttribute(
		'data-id',
		String(earliestLegalDayId)
	);
});
