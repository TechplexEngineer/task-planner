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
