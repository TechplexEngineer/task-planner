import { expect, test } from '@playwright/test';

test('deleting a dependency edge and then a task removes them from the graph', async ({ page }) => {
	const projectName = `E2E Delete ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('First');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('tbody tr').filter({ hasText: 'First' })).toBeVisible();
	await page.getByPlaceholder('Title').fill('Second');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('tbody tr').filter({ hasText: 'Second' })).toBeVisible();

	const predecessorSelect = page.locator('select[name="predecessorId"]');
	const successorSelect = page.locator('select[name="successorId"]');
	await predecessorSelect.selectOption({ label: 'First' });
	await successorSelect.selectOption({ label: 'Second' });
	await page.getByRole('button', { name: 'Add dependency' }).click();
	// Wait for the dependency's use:enhance submission (and its invalidateAll) to
	// settle before navigating away - otherwise the still-in-flight form action can
	// win a race against the Graph link's navigation and leave us on the List view.
	await expect(page.locator('li').filter({ hasText: 'First → Second' })).toBeVisible();

	await page.getByRole('link', { name: 'Graph', exact: true }).click();
	await expect(page.locator('line.edge')).toHaveCount(1);

	// Playwright's actionability check computes visibility from a content quad that,
	// for stroke-only SVG shapes like <line>, doesn't account for stroke-width (even
	// though getBoundingClientRect/boundingBox() does) - so a plain .hover() reports
	// the element as "not visible" despite it being hoverable by real users. Dispatch
	// the event directly to reveal the edge's delete control, then click it.
	await page.locator('.edge-hit-area').dispatchEvent('pointerenter');
	await page.locator('.delete-dependency-button').click();
	await expect(page.locator('line.edge')).toHaveCount(0);

	await page.locator('g[data-task-id]').first().locator('rect.node').hover();
	await page.locator('.delete-button').click();
	await expect(page.locator('g[data-task-id]')).toHaveCount(1);
});
