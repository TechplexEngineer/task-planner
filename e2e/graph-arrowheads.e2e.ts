import { expect, test } from '@playwright/test';

test('dependency edges render an arrowhead pointing from ancestor to descendant', async ({
	page
}) => {
	const projectName = `E2E Arrowheads ${Date.now()}`;

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
	await expect(
		page.locator('li').filter({ hasText: 'Buy bread → Spread peanut butter' })
	).toBeVisible();

	await page.getByRole('link', { name: 'Graph', exact: true }).click();
	await expect(page.locator('marker#dependency-arrowhead')).toHaveCount(1);
	await expect(page.locator('line.edge')).toHaveAttribute(
		'marker-end',
		'url(#dependency-arrowhead)'
	);
});
