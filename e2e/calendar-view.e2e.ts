import { expect, test } from '@playwright/test';

test('undated tasks show as unassigned and can be scheduled onto the calendar', async ({
	page
}) => {
	const projectName = `E2E Calendar ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Design');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('tbody tr').filter({ hasText: 'Design' })).toBeVisible();

	await page.getByRole('link', { name: 'Calendar' }).click();
	await expect(page.locator('h2', { hasText: 'Calendar' })).toBeVisible();

	// Newly created tasks have no scheduled date, so they start out unassigned.
	await expect(
		page.locator('.unassigned-zone').locator('.task-chip').filter({ hasText: 'Design' })
	).toBeVisible();

	const taskId = await page
		.locator('.unassigned-zone .task-chip')
		.filter({ hasText: 'Design' })
		.getAttribute('data-task-id');

	// Drive the ?/setScheduledDate action directly (same action the drag handler
	// submits) since the drag library uses pointer events that Playwright can't
	// easily simulate, matching the existing list-view reorder tests' approach.
	await page.locator('input[name="taskId"]').evaluate((el: HTMLInputElement, value: string) => {
		el.value = value;
	}, taskId ?? '');
	await page.locator('input[name="date"]').evaluate((el: HTMLInputElement, value: string) => {
		el.value = value;
	}, '2026-03-10');
	await page
		.locator('form[action="?/setScheduledDate"]')
		.evaluate((form: HTMLFormElement) => form.requestSubmit());

	await expect(page.locator('.unassigned-zone').getByText('Nothing unassigned')).toBeVisible();
});

test('shows a warning when a successor is scheduled before its predecessor finishes', async ({
	page
}) => {
	const projectName = `E2E Calendar Order ${Date.now()}`;

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

	const predecessorSelect = page.locator('select[name="predecessorId"]');
	const successorSelect = page.locator('select[name="successorId"]');
	await predecessorSelect.selectOption({ label: 'Buy bread' });
	await successorSelect.selectOption({ label: 'Spread peanut butter' });
	await page.getByRole('button', { name: 'Add dependency' }).click();

	const breadId = await page
		.locator('tbody tr')
		.filter({ hasText: 'Buy bread' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');
	const spreadId = await page
		.locator('tbody tr')
		.filter({ hasText: 'Spread peanut butter' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');

	await page.getByRole('link', { name: 'Calendar' }).click();
	await expect(page.locator('h2', { hasText: 'Calendar' })).toBeVisible();

	async function scheduleTask(taskId: string, date: string) {
		await page.locator('input[name="taskId"]').evaluate((el: HTMLInputElement, value: string) => {
			el.value = value;
		}, taskId);
		await page.locator('input[name="date"]').evaluate((el: HTMLInputElement, value: string) => {
			el.value = value;
		}, date);
		await page
			.locator('form[action="?/setScheduledDate"]')
			.evaluate((form: HTMLFormElement) => form.requestSubmit());
	}

	// Both scheduled the same day, within the currently-displayed month (the
	// calendar defaults to today's month) - the predecessor (1 day duration)
	// isn't done until the following day, so the successor starting the same
	// day is an order violation.
	const now = new Date();
	const sameDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-05`;
	await scheduleTask(breadId ?? '', sameDay);
	await scheduleTask(spreadId ?? '', sameDay);

	await expect(page.locator('.task-chip.warning')).toHaveCount(2);
});
