import { expect, test } from '@playwright/test';

test('panning and zooming change the canvas viewBox', async ({ page }) => {
	const projectName = `E2E Pan Zoom ${Date.now()}`;

	await page.goto('/');
	await page.getByLabel('New project name').fill(projectName);
	await page.getByRole('button', { name: 'Create project' }).click();
	await page.locator('li').filter({ hasText: projectName }).getByRole('link').click();
	await page.getByRole('link', { name: 'Graph', exact: true }).click();

	const canvas = page.locator('svg.graph-canvas');
	const initialViewBox = await canvas.getAttribute('viewBox');

	const box = await canvas.boundingBox();
	if (!box) throw new Error('canvas not visible');

	// Pan by dragging the empty background.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 - 30);
	await page.mouse.up();
	const pannedViewBox = await canvas.getAttribute('viewBox');
	expect(pannedViewBox).not.toBe(initialViewBox);

	// Zoom in with the wheel.
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.wheel(0, -200);
	const zoomedViewBox = await canvas.getAttribute('viewBox');
	expect(zoomedViewBox).not.toBe(pannedViewBox);
});
