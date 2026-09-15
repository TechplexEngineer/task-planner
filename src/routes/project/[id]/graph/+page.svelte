<script lang="ts">
	import type { PageData } from './$types';
	import GraphNode from './GraphNode.svelte';
	import { NODE_SIZE } from '$lib/graph-layout';
	import {
		DEFAULT_VIEWPORT,
		panViewport,
		zoomViewportAtPoint,
		type Viewport
	} from '$lib/graph-viewport';

	let { data }: { data: PageData } = $props();

	const VIEW_WIDTH = 900;
	const VIEW_HEIGHT = 600;

	let viewport = $state<Viewport>(DEFAULT_VIEWPORT);
	let svgEl: SVGSVGElement;
	let panning = $state(false);
	let lastPointer = { x: 0, y: 0 };

	let viewBox = $derived(
		`${viewport.x} ${viewport.y} ${VIEW_WIDTH / viewport.scale} ${VIEW_HEIGHT / viewport.scale}`
	);

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const rect = svgEl.getBoundingClientRect();
		const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		viewport = zoomViewportAtPoint(viewport, { x: e.clientX, y: e.clientY }, rect, zoomFactor);
	}

	function handleBackgroundPointerDown(e: PointerEvent) {
		if (e.target !== svgEl) return;
		panning = true;
		lastPointer = { x: e.clientX, y: e.clientY };
		svgEl.setPointerCapture(e.pointerId);
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
</script>

<h2>Graph</h2>

<svg
	bind:this={svgEl}
	class="graph-canvas"
	{viewBox}
	onwheel={handleWheel}
	onpointerdown={handleBackgroundPointerDown}
	onpointermove={handleBackgroundPointerMove}
	onpointerup={handleBackgroundPointerUp}
>
	{#each data.dependencies as dep (dep.id)}
		{@const from = data.tasks.find((t) => t.id === dep.predecessorId)}
		{@const to = data.tasks.find((t) => t.id === dep.successorId)}
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
	{#each data.tasks as task (task.id)}
		<GraphNode {task} />
	{/each}
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
