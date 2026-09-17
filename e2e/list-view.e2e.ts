import { expect, test } from '@playwright/test';

test('create tasks, add a dependency, reject a cycle, and see the critical path highlighted', async ({
	page
}) => {
	const projectName = `E2E List ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await expect(page.locator('h2', { hasText: 'Task list' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('Buy bread');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Buy bread' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('Spread peanut butter');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Spread peanut butter' })).toBeVisible();

	// Buy bread -> Spread peanut butter
	const predecessorSelect = page.locator('select[name="predecessorId"]');
	const successorSelect = page.locator('select[name="successorId"]');
	await predecessorSelect.selectOption({ label: 'Buy bread' });
	await successorSelect.selectOption({ label: 'Spread peanut butter' });
	await page.getByRole('button', { name: 'Add dependency' }).click();
	await expect(
		page.locator('li').filter({ hasText: 'Buy bread → Spread peanut butter' })
	).toBeVisible();

	// Attempting the reverse dependency should be rejected as a cycle.
	await predecessorSelect.selectOption({ label: 'Spread peanut butter' });
	await successorSelect.selectOption({ label: 'Buy bread' });
	await page.getByRole('button', { name: 'Add dependency' }).click();
	await expect(page.getByText('This dependency would create a cycle')).toBeVisible();

	// Both tasks are on the only path through the graph, so both are critical.
	await expect(page.locator('li.critical').filter({ hasText: 'Buy bread' })).toBeVisible();
	await expect(
		page.locator('li.critical').filter({ hasText: 'Spread peanut butter' })
	).toBeVisible();
});

test('reordering tasks keeps the new order after the page data refetches', async ({ page }) => {
	const projectName = `E2E Reorder ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await expect(page.locator('h2', { hasText: 'Task list' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('First task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'First task' })).toBeVisible();

	await page.getByPlaceholder('Title').fill('Second task');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Second task' })).toBeVisible();

	const firstId = await page
		.locator('li')
		.filter({ hasText: 'First task' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');
	const secondId = await page
		.locator('li')
		.filter({ hasText: 'Second task' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');

	// Drive the ?/reorder action directly (same action the drag handler submits)
	// to put "Second task" ahead of "First task".
	await page.locator('input[name="orderedIds"]').evaluate((el: HTMLInputElement, value: string) => {
		el.value = value;
	}, `${secondId},${firstId}`);
	await page
		.locator('form[action="?/reorder"]')
		.evaluate((form: HTMLFormElement) => form.requestSubmit());

	// After invalidateAll() refetches tasks, the rendered order must reflect the
	// new priority_rank — it must not revert to insertion order.
	await expect
		.poll(() => page.locator('li strong').allTextContents())
		.toEqual(['Second task', 'First task']);
});

test('importing multiline text creates a chained task per line', async ({ page }) => {
	const projectName = `E2E Import ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await expect(page.locator('h2', { hasText: 'Task list' })).toBeVisible();

	await page
		.getByPlaceholder('One task per line. Each line depends on the line above it.')
		.fill('Design\nBuild\nShip');
	await page.getByRole('button', { name: 'Import' }).click();

	await expect
		.poll(() => page.locator('li strong').allTextContents())
		.toEqual(['Design', 'Build', 'Ship']);

	await expect(page.locator('li').filter({ hasText: 'Design → Build' })).toBeVisible();
	await expect(page.locator('li').filter({ hasText: 'Build → Ship' })).toBeVisible();
});
