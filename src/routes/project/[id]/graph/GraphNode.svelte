<script lang="ts">
	import { NODE_SIZE } from '$lib/graph-layout';
	import type { PageData } from './$types';

	let { task }: { task: PageData['tasks'][number] } = $props();
</script>

<g data-task-id={task.id}>
	<rect
		x={task.x}
		y={task.y}
		width={NODE_SIZE}
		height={NODE_SIZE}
		class="node"
		class:critical={task.schedule.onCriticalPath}
		data-status={task.status}
	/>
	<text
		x={task.x + NODE_SIZE / 2}
		y={task.y + NODE_SIZE / 2}
		text-anchor="middle"
		dominant-baseline="middle"
	>
		{task.title}
	</text>
</g>

<style>
	.node {
		fill: white;
		stroke: #333;
		stroke-width: 2;
	}
	.node.critical {
		stroke: crimson;
		stroke-width: 3;
	}
	.node[data-status='done'] {
		fill: #d4f7d4;
	}
	.node[data-status='in_progress'] {
		fill: #fff6cc;
	}
	text {
		font-size: 12px;
		pointer-events: none;
		user-select: none;
	}
</style>
