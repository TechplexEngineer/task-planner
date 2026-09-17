import { expect, test } from '@playwright/test';

test('dragging a task bar edge persists its duration across reload', async ({ page }) => {
	const projectName = `E2E Gantt Resize ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();

	await page.getByPlaceholder('Title').fill('Bake bread');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.locator('tbody tr').filter({ hasText: 'Bake bread' })).toBeVisible();

	await page.getByRole('link', { name: 'Gantt' }).click();
	await expect(page.locator('h2', { hasText: 'Gantt' })).toBeVisible();

	const bar = page.locator('.wx-bar.wx-task').filter({ hasText: 'Bake bread' });
	const box = await bar.boundingBox();
	if (!box) throw new Error('task bar not visible');

	// Grab the right-edge resize handle (rightmost slice of the bar) and drag it
	// outward to extend the task's duration.
	const patchResponse = page.waitForResponse(
		(res) => res.request().method() === 'PATCH' && res.url().includes('/gantt')
	);
	await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width + 150, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();
	await patchResponse;

	await page.getByRole('link', { name: 'List' }).click();
	const durationText = await page
		.locator('tbody tr')
		.filter({ hasText: 'Bake bread' })
		.locator('td')
		.nth(3)
		.textContent();
	const duration = Number((durationText ?? '').replace('d', ''));
	expect(duration).toBeGreaterThan(1);
});
