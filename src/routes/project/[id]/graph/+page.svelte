<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import GraphNode from './GraphNode.svelte';
	import { NODE_SIZE, VIEW_WIDTH, VIEW_HEIGHT, computeBasePositions } from '$lib/graph-layout';
	import {
		DEFAULT_VIEWPORT,
		panViewport,
		screenToSvg,
		svgToScreen,
		zoomViewportAtPoint,
		type Viewport
	} from '$lib/graph-viewport';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let viewport = $state<Viewport>(DEFAULT_VIEWPORT);
	let svgEl: SVGSVGElement | undefined = $state();
	let panning = $state(false);
	let lastPointer = { x: 0, y: 0 };

	// Not a writable $derived: task fields (x/y while dragging, title, description,
	// durationDays, status, schedule) are mutated in place all over this file and in
	// GraphNode.svelte for immediate visual feedback (WYSIWYG editing) before/without
	// a round-trip to the server. $derived only tracks its own recomputation, not
	// mutations to properties of the object it returns, so switching this to a
	// writable $derived (as the lint rule suggests) silently breaks those in-place
	// updates - e.g. the critical-path highlight no longer refreshes after editing a
	// task's duration in the details popover. $state's deep reactivity is required;
	// the $effect below only resyncs from the server on navigation/reload.
	// eslint-disable-next-line svelte/prefer-writable-derived
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

	let selectedTaskId = $state<number | null>(null);
	let selectedTask = $derived(tasks.find((t) => t.id === selectedTaskId) ?? null);
	let popoverPosition = $derived(
		selectedTask && svgEl
			? svgToScreen(
					{ x: selectedTask.x + NODE_SIZE, y: selectedTask.y },
					svgEl.getBoundingClientRect(),
					viewport
				)
			: null
	);

	function handleOpenDetails(taskId: number) {
		selectedTaskId = taskId;
	}

	async function patchFields(taskId: number, patch: Record<string, unknown>) {
		const response = await fetch(resolve('/project/[id]/graph', { id: String(data.project.id) }), {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ type: 'fields', taskId, patch })
		});
		const body = (await response.json()) as {
			tasks: { id: number; schedule: PageData['tasks'][number]['schedule'] }[];
		};
		for (const entry of body.tasks) {
			const t = tasks.find((task) => task.id === entry.id);
			if (t) t.schedule = entry.schedule;
		}
	}

	function handleDescriptionChange(e: Event) {
		if (!selectedTask) return;
		const description = (e.target as HTMLTextAreaElement).value;
		selectedTask.description = description;
		patchFields(selectedTask.id, { description });
	}

	function handleDurationChange(e: Event) {
		if (!selectedTask) return;
		const durationDays = Number((e.target as HTMLInputElement).value);
		selectedTask.durationDays = durationDays;
		patchFields(selectedTask.id, { durationDays });
	}

	function handleStatusChange(e: Event) {
		if (!selectedTask) return;
		const status = (e.target as HTMLSelectElement).value as 'todo' | 'in_progress' | 'done';
		selectedTask.status = status;
		patchFields(selectedTask.id, { status });
	}

	let createSuccessorForm: HTMLFormElement;
	let predecessorIdInput: HTMLInputElement;

	function handleCreateSuccessor(predecessorId: number) {
		predecessorIdInput.value = String(predecessorId);
		createSuccessorForm.requestSubmit();
	}

	let connectorFrom = $state<number | null>(null);
	let connectorPointer = $state<{ x: number; y: number } | null>(null);

	function handleConnectorDragStart(taskId: number) {
		connectorFrom = taskId;
	}

	function handleWindowPointerMove(e: PointerEvent) {
		if (connectorFrom === null || !svgEl) return;
		connectorPointer = screenToSvg(
			{ x: e.clientX, y: e.clientY },
			svgEl.getBoundingClientRect(),
			viewport
		);
	}

	function handleWindowPointerUp() {
		connectorFrom = null;
		connectorPointer = null;
	}

	let createDependencyForm: HTMLFormElement;
	let dependencyPredecessorInput: HTMLInputElement;
	let dependencySuccessorInput: HTMLInputElement;

	function handleConnectorDrop(successorId: number) {
		if (connectorFrom === null) return;
		dependencyPredecessorInput.value = String(connectorFrom);
		dependencySuccessorInput.value = String(successorId);
		createDependencyForm.requestSubmit();
		connectorFrom = null;
		connectorPointer = null;
	}

	let deleteTaskForm: HTMLFormElement;
	let deleteTaskIdInput: HTMLInputElement;

	function handleDeleteTask(taskId: number) {
		deleteTaskIdInput.value = String(taskId);
		deleteTaskForm.requestSubmit();
	}

	let deleteDependencyForm: HTMLFormElement;
	let deleteDependencyIdInput: HTMLInputElement;

	function handleDeleteDependency(dependencyId: number) {
		deleteDependencyIdInput.value = String(dependencyId);
		deleteDependencyForm.requestSubmit();
	}

	let hoveredDependencyId = $state<number | null>(null);
</script>

<h2>Graph</h2>

<svelte:window onpointermove={handleWindowPointerMove} onpointerup={handleWindowPointerUp} />

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
		{@const from = tasks.find((t) => t.id === dep.predecessorId)}
		{@const to = tasks.find((t) => t.id === dep.successorId)}
		{#if from && to}
			{@const x1 = from.x + NODE_SIZE}
			{@const y1 = from.y + NODE_SIZE / 2}
			{@const x2 = to.x}
			{@const y2 = to.y + NODE_SIZE / 2}
			<g
				onpointerenter={() => (hoveredDependencyId = dep.id)}
				onpointerleave={() => (hoveredDependencyId = null)}
			>
				<line class="edge" {x1} {y1} {x2} {y2} />
				<line class="edge-hit-area" {x1} {y1} {x2} {y2} />
				{#if hoveredDependencyId === dep.id}
					<g
						class="delete-dependency-button"
						onpointerdown={(e) => e.stopPropagation()}
						onclick={() => handleDeleteDependency(dep.id)}
					>
						<circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r="8" />
						<text
							x={(x1 + x2) / 2}
							y={(y1 + y2) / 2}
							text-anchor="middle"
							dominant-baseline="middle">×</text
						>
					</g>
				{/if}
			</g>
		{/if}
	{/each}
	{#if connectorFrom !== null && connectorPointer}
		{@const source = tasks.find((t) => t.id === connectorFrom)}
		{#if source}
			<line
				class="connector-preview"
				x1={source.x + NODE_SIZE}
				y1={source.y + NODE_SIZE / 2}
				x2={connectorPointer.x}
				y2={connectorPointer.y}
			/>
		{/if}
	{/if}
	{#if svgEl}
		{#each tasks as task (task.id)}
			<GraphNode
				{task}
				{viewport}
				canvasRect={svgEl.getBoundingClientRect()}
				onDragEnd={handleDragEnd}
				onTitleChange={handleTitleChange}
				onCreateSuccessor={handleCreateSuccessor}
				onConnectorDragStart={handleConnectorDragStart}
				onConnectorDrop={handleConnectorDrop}
				connectorDragActive={connectorFrom !== null && connectorFrom !== task.id}
				onDelete={handleDeleteTask}
				onOpenDetails={handleOpenDetails}
			/>
		{/each}
	{/if}
</svg>

{#if selectedTask && popoverPosition}
	<div class="details-popover" style={`left: ${popoverPosition.x}px; top: ${popoverPosition.y}px;`}>
		<button class="btn btn-secondary btn-sm" onclick={() => (selectedTaskId = null)}>Close</button>

		<label>
			Description
			<textarea value={selectedTask.description} onchange={handleDescriptionChange}></textarea>
		</label>
		{#if selectedTask.type === 'task'}
			<label>
				Duration (days)
				<input
					type="number"
					min="0"
					value={selectedTask.durationDays}
					onchange={handleDurationChange}
				/>
			</label>
		{/if}
		<label>
			Status
			<select value={selectedTask.status} onchange={handleStatusChange}>
				<option value="todo">To do</option>
				<option value="in_progress">In progress</option>
				<option value="done">Done</option>
			</select>
		</label>
	</div>
{/if}

<form
	bind:this={createSuccessorForm}
	method="POST"
	action="?/createSuccessor"
	use:enhance
	style="display: none"
>
	<input bind:this={predecessorIdInput} type="hidden" name="predecessorId" value="" />
</form>

<form
	bind:this={createDependencyForm}
	method="POST"
	action="?/createDependency"
	use:enhance
	style="display: none"
>
	<input bind:this={dependencyPredecessorInput} type="hidden" name="predecessorId" value="" />
	<input bind:this={dependencySuccessorInput} type="hidden" name="successorId" value="" />
</form>
{#if form?.formName === 'createDependency' && form.error}
	<p class="error">{form.error}</p>
{/if}

<form
	bind:this={deleteTaskForm}
	method="POST"
	action="?/deleteTask"
	use:enhance
	style="display: none"
>
	<input bind:this={deleteTaskIdInput} type="hidden" name="id" value="" />
</form>
<form
	bind:this={deleteDependencyForm}
	method="POST"
	action="?/deleteDependency"
	use:enhance
	style="display: none"
>
	<input bind:this={deleteDependencyIdInput} type="hidden" name="id" value="" />
</form>

<style>
	.graph-canvas {
		width: 100%;
		aspect-ratio: 3 / 2;
		border: 1px solid #ccc;
		touch-action: none;
	}
	.edge {
		stroke: #999;
		stroke-width: 2;
	}
	.connector-preview {
		stroke: steelblue;
		stroke-width: 2;
		stroke-dasharray: 4;
	}
	.edge-hit-area {
		stroke: transparent;
		stroke-width: 14;
	}
	.delete-dependency-button {
		cursor: pointer;
	}
	.delete-dependency-button circle {
		fill: crimson;
	}
	.delete-dependency-button text {
		fill: white;
		pointer-events: none;
		font-size: 12px;
	}
	.details-popover {
		position: fixed;
		background: white;
		border: 1px solid #ccc;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		z-index: 10;
	}
</style>
