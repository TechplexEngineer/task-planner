<script lang="ts">
	import type { PageData } from './$types';
	import GraphNode from './GraphNode.svelte';
	import { NODE_SIZE } from '$lib/graph-layout';

	let { data }: { data: PageData } = $props();

	const VIEW_WIDTH = 900;
	const VIEW_HEIGHT = 600;
</script>

<h2>Graph</h2>

<svg class="graph-canvas" viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}>
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
	}
	.edge {
		stroke: #999;
		stroke-width: 2;
	}
</style>
