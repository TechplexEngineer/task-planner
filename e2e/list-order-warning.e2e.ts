import { expect, test } from '@playwright/test';

test('shows a warning when a successor is ranked above its predecessor', async ({ page }) => {
	const projectName = `E2E Order ${Date.now()}`;

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

	await expect(page.locator('.warning')).toHaveCount(0);

	const breadId = await page
		.locator('li')
		.filter({ hasText: 'Buy bread' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');
	const spreadId = await page
		.locator('li')
		.filter({ hasText: 'Spread peanut butter' })
		.locator('form[action="?/deleteTask"] input[name="id"]')
		.getAttribute('value');

	// Swap the order so the successor (spread) is ranked before its predecessor (buy bread).
	await page.locator('input[name="orderedIds"]').evaluate((el: HTMLInputElement, value: string) => {
		el.value = value;
	}, `${spreadId},${breadId}`);
	await page
		.locator('form[action="?/reorder"]')
		.evaluate((form: HTMLFormElement) => form.requestSubmit());

	await expect(page.locator('.warning')).toHaveCount(2);
});
