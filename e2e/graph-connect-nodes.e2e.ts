import { expect, test } from '@playwright/test';

test('drag-connecting two nodes creates a dependency, and the reverse is rejected as a cycle', async ({
	page
}) => {
	const projectName = `E2E Connect ${Date.now()}`;

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

	await page.getByRole('link', { name: 'Graph', exact: true }).click();

	const nodes = page.locator('g[data-task-id]');
	const firstNode = nodes.first();
	const secondNode = nodes.nth(1);

	await firstNode.locator('rect.node').hover();
	const handle = firstNode.locator('.connector-handle');
	const handleBox = await handle.boundingBox();
	const secondBox = await secondNode.locator('rect.node').boundingBox();
	if (!handleBox || !secondBox) throw new Error('elements not visible');

	await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
	await page.mouse.down();
	await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, {
		steps: 5
	});
	await page.mouse.up();

	await expect(page.locator('line.edge')).toHaveCount(1);

	// Attempt the reverse connection — should be rejected as a cycle.
	await secondNode.locator('rect.node').hover();
	const reverseHandle = secondNode.locator('.connector-handle');
	const reverseHandleBox = await reverseHandle.boundingBox();
	const firstBox = await firstNode.locator('rect.node').boundingBox();
	if (!reverseHandleBox || !firstBox) throw new Error('elements not visible');

	await page.mouse.move(
		reverseHandleBox.x + reverseHandleBox.width / 2,
		reverseHandleBox.y + reverseHandleBox.height / 2
	);
	await page.mouse.down();
	await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2, {
		steps: 5
	});
	await page.mouse.up();

	await expect(page.getByText('This dependency would create a cycle')).toBeVisible();
	await expect(page.locator('line.edge')).toHaveCount(1);
});
