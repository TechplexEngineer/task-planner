<script lang="ts">
	import { NODE_SIZE } from '$lib/graph-layout';
	import { screenToSvg, type Rect, type Viewport } from '$lib/graph-viewport';
	import type { PageData } from './$types';

	let {
		task,
		viewport,
		canvasRect,
		onDragEnd
	}: {
		task: PageData['tasks'][number];
		viewport: Viewport;
		canvasRect: Rect;
		onDragEnd: (taskId: number, offsetX: number, offsetY: number) => void;
	} = $props();

	let dragging = $state(false);
	let dragStartSvg = { x: 0, y: 0 };
	let dragStartTask = { x: 0, y: 0 };
	let moved = 0;

	function handlePointerDown(e: PointerEvent) {
		dragging = true;
		moved = 0;
		dragStartSvg = screenToSvg({ x: e.clientX, y: e.clientY }, canvasRect, viewport);
		dragStartTask = { x: task.x, y: task.y };
		(e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging) return;
		const current = screenToSvg({ x: e.clientX, y: e.clientY }, canvasRect, viewport);
		const dx = current.x - dragStartSvg.x;
		const dy = current.y - dragStartSvg.y;
		moved = Math.max(moved, Math.hypot(dx, dy));
		task.x = dragStartTask.x + dx;
		task.y = dragStartTask.y + dy;
	}

	function handlePointerUp() {
		if (!dragging) return;
		dragging = false;
		if (moved < 4) return;
		onDragEnd(task.id, task.x, task.y);
	}
</script>

<g
	data-task-id={task.id}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
>
	<rect
		x={task.x}
		y={task.y}
		width={NODE_SIZE}
		height={NODE_SIZE}
		class="node"
		class:critical={task.schedule.onCriticalPath}
		data-status={task.status}
	/>
	<text x={task.x + NODE_SIZE / 2} y={task.y + NODE_SIZE / 2} text-anchor="middle" dominant-baseline="middle">
		{task.title}
	</text>
</g>

<style>
	.node {
		fill: white;
		stroke: #333;
		stroke-width: 2;
		cursor: grab;
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
