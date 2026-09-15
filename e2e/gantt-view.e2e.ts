import { expect, test } from '@playwright/test';

test('shows dependent tasks and a milestone on the Gantt timeline with critical-path highlighting', async ({
	page
}) => {
	const projectName = `E2E Gantt ${Date.now()}`;

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
	await expect(
		page.locator('li').filter({ hasText: 'Buy bread → Spread peanut butter' })
	).toBeVisible();

	await page.getByPlaceholder('Title').fill('Sandwich ready');
	await page.locator('select[name="type"]').selectOption('milestone');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('li').filter({ hasText: 'Sandwich ready' })).toBeVisible();

	await predecessorSelect.selectOption({ label: 'Spread peanut butter' });
	await successorSelect.selectOption({ label: 'Sandwich ready' });
	await page.getByRole('button', { name: 'Add dependency' }).click();
	await expect(
		page.locator('li').filter({ hasText: 'Spread peanut butter → Sandwich ready' })
	).toBeVisible();

	await page.getByRole('link', { name: 'Gantt' }).click();
	await expect(page.locator('h2', { hasText: 'Gantt' })).toBeVisible();

	// The only path through the graph, so both tasks and the milestone are critical.
	const breadBar = page.locator('.wx-bar.wx-task').filter({ hasText: 'Buy bread' });
	await expect(breadBar.locator('.critical')).toHaveCount(1);
	const spreadBar = page.locator('.wx-bar.wx-task').filter({ hasText: 'Spread peanut butter' });
	await expect(spreadBar.locator('.critical')).toHaveCount(1);

	const milestoneBar = page.locator('.wx-bar.wx-milestone');
	await expect(milestoneBar.locator('.critical')).toHaveCount(1);
	await expect(page.locator('.label', { hasText: 'Sandwich ready' })).toBeVisible();

	// No date-dragging: the readonly Gantt renders no progress marker or link-creation handles.
	await expect(page.locator('.wx-progress-marker')).toHaveCount(0);
});
