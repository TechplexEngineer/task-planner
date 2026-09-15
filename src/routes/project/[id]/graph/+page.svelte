<script lang="ts">
	import type { PageData } from './$types';
	import GraphNode from './GraphNode.svelte';
	import { NODE_SIZE, computeBasePositions } from '$lib/graph-layout';
	import { DEFAULT_VIEWPORT, panViewport, zoomViewportAtPoint, type Viewport } from '$lib/graph-viewport';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();

	const VIEW_WIDTH = 900;
	const VIEW_HEIGHT = 600;

	let viewport = $state<Viewport>(DEFAULT_VIEWPORT);
	let svgEl: SVGSVGElement | undefined = $state();
	let panning = $state(false);
	let lastPointer = { x: 0, y: 0 };

	let tasks = $state(data.tasks.map((t) => ({ ...t })));
	$effect(() => {
		tasks = data.tasks.map((t) => ({ ...t }));
	});

	let basePositions = $derived(computeBasePositions(data.tasks));

	let viewBox = $derived(
		`${viewport.x} ${viewport.y} ${VIEW_WIDTH / viewport.scale} ${VIEW_HEIGHT / viewport.scale}`
	);

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const rect = svgEl!.getBoundingClientRect();
		const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		viewport = zoomViewportAtPoint(viewport, { x: e.clientX, y: e.clientY }, rect, zoomFactor);
	}

	function handleBackgroundPointerDown(e: PointerEvent) {
		if (e.target !== svgEl) return;
		panning = true;
		lastPointer = { x: e.clientX, y: e.clientY };
		svgEl!.setPointerCapture(e.pointerId);
	}

	function handleBackgroundPointerMove(e: PointerEvent) {
		if (!panning) return;
		const dx = e.clientX - lastPointer.x;
		const dy = e.clientY - lastPointer.y;
		lastPointer = { x: e.clientX, y: e.clientY };
		viewport = panViewport(viewport, dx, dy);
	}

	function handleBackgroundPointerUp() {
		panning = false;
	}

	async function handleDragEnd(taskId: number, absoluteX: number, absoluteY: number) {
		const base = basePositions.get(taskId)!;
		await fetch(resolve('/project/[id]/graph', { id: String(data.project.id) }), {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				type: 'position',
				taskId,
				offsetX: absoluteX - base.x,
				offsetY: absoluteY - base.y
			})
		});
	}

	async function handleTitleChange(taskId: number, title: string) {
		await fetch(resolve('/project/[id]/graph', { id: String(data.project.id) }), {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'fields', taskId, patch: { title } })
		});
	}
</script>

<h2>Graph</h2>

<svg
	bind:this={svgEl}
	class="graph-canvas"
	viewBox={viewBox}
	onwheel={handleWheel}
	onpointerdown={handleBackgroundPointerDown}
	onpointermove={handleBackgroundPointerMove}
	onpointerup={handleBackgroundPointerUp}
>
	{#each data.dependencies as dep (dep.id)}
		{@const from = tasks.find((t) => t.id === dep.predecessorId)}
		{@const to = tasks.find((t) => t.id === dep.successorId)}
		{#if from && to}
			<line
				class="edge"
				x1={from.x + NODE_SIZE}
				y1={from.y + NODE_SIZE / 2}
				x2={to.x}
				y2={to.y + NODE_SIZE / 2}
			/>
		{/if}
	{/each}
	{#if svgEl}
		{#each tasks as task (task.id)}
			<GraphNode
				{task}
				{viewport}
				canvasRect={svgEl.getBoundingClientRect()}
				onDragEnd={handleDragEnd}
				onTitleChange={handleTitleChange}
			/>
		{/each}
	{/if}
</svg>

<style>
	.graph-canvas {
		width: 100%;
		height: 80vh;
		border: 1px solid #ccc;
		touch-action: none;
	}
	.edge {
		stroke: #999;
		stroke-width: 2;
	}
</style>
