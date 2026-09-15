<script lang="ts">
	import { NODE_SIZE } from '$lib/graph-layout';
	import { screenToSvg, type Rect, type Viewport } from '$lib/graph-viewport';
	import type { PageData } from './$types';

	let {
		task,
		viewport,
		canvasRect,
		onDragEnd,
		onTitleChange,
		onCreateSuccessor,
		onConnectorDragStart,
		onConnectorDrop,
		connectorDragActive,
		onDelete
	}: {
		task: PageData['tasks'][number];
		viewport: Viewport;
		canvasRect: Rect;
		onDragEnd: (taskId: number, offsetX: number, offsetY: number) => void;
		onTitleChange: (taskId: number, title: string) => void;
		onCreateSuccessor: (predecessorId: number) => void;
		onConnectorDragStart: (taskId: number) => void;
		onConnectorDrop: (successorId: number) => void;
		connectorDragActive: boolean;
		onDelete: (taskId: number) => void;
	} = $props();

	let dragging = $state(false);
	let dragStartSvg = { x: 0, y: 0 };
	let dragStartTask = { x: 0, y: 0 };
	let moved = 0;
	let editingTitle = $state(false);
	let titleDraft = $state(task.title);
	let hovering = $state(false);

	function handlePointerDown(e: PointerEvent) {
		if (editingTitle) return;
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

	function startEditingTitle() {
		titleDraft = task.title;
		editingTitle = true;
	}

	function commitTitle() {
		editingTitle = false;
		if (titleDraft.trim() !== '' && titleDraft !== task.title) {
			task.title = titleDraft;
			onTitleChange(task.id, titleDraft);
		}
	}

	function focusOnMount(el: HTMLInputElement) {
		el.focus();
		el.select();
	}
</script>

<g
	data-task-id={task.id}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={() => {
		handlePointerUp();
		if (connectorDragActive) onConnectorDrop(task.id);
	}}
	ondblclick={startEditingTitle}
	onpointerenter={() => (hovering = true)}
	onpointerleave={() => (hovering = false)}
>
	<rect
		x={task.x}
		y={task.y}
		width={NODE_SIZE}
		height={NODE_SIZE}
		class="node"
		class:critical={task.schedule.onCriticalPath}
		class:drop-target={connectorDragActive}
		data-status={task.status}
	/>
	{#if editingTitle}
		<foreignObject x={task.x + 4} y={task.y + NODE_SIZE / 2 - 10} width={NODE_SIZE - 8} height="20">
			<input
				class="title-input"
				value={titleDraft}
				use:focusOnMount
				oninput={(e) => (titleDraft = (e.target as HTMLInputElement).value)}
				onblur={commitTitle}
				onkeydown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
			/>
		</foreignObject>
	{:else}
		<text x={task.x + NODE_SIZE / 2} y={task.y + NODE_SIZE / 2} text-anchor="middle" dominant-baseline="middle">
			{task.title}
		</text>
	{/if}
	{#if hovering}
		<g
			class="add-successor-button"
			onpointerdown={(e) => e.stopPropagation()}
			onclick={() => onCreateSuccessor(task.id)}
		>
			<circle cx={task.x + NODE_SIZE / 2} cy={task.y + NODE_SIZE + 14} r="10" />
			<text x={task.x + NODE_SIZE / 2} y={task.y + NODE_SIZE + 14} text-anchor="middle" dominant-baseline="middle">+</text>
		</g>
		<circle
			class="connector-handle"
			cx={task.x + NODE_SIZE}
			cy={task.y + NODE_SIZE / 2}
			r="6"
			onpointerdown={(e) => {
				e.stopPropagation();
				onConnectorDragStart(task.id);
			}}
		/>
		<g
			class="delete-button"
			onpointerdown={(e) => e.stopPropagation()}
			onclick={() => onDelete(task.id)}
		>
			<circle cx={task.x + NODE_SIZE - 8} cy={task.y + 8} r="8" />
			<text x={task.x + NODE_SIZE - 8} y={task.y + 8} text-anchor="middle" dominant-baseline="middle">×</text>
		</g>
	{/if}
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
	.node.drop-target {
		stroke: seagreen;
		stroke-width: 4;
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
	.title-input {
		width: 100%;
		height: 100%;
		font-size: 12px;
		box-sizing: border-box;
	}
	.add-successor-button {
		cursor: pointer;
	}
	.add-successor-button circle {
		fill: #333;
	}
	.add-successor-button text {
		fill: white;
		pointer-events: none;
		font-size: 14px;
	}
	.connector-handle {
		fill: steelblue;
		cursor: crosshair;
	}
	.delete-button {
		cursor: pointer;
	}
	.delete-button circle {
		fill: crimson;
	}
	.delete-button text {
		fill: white;
		pointer-events: none;
		font-size: 12px;
	}
</style>
