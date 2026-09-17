<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { flattenTree, type TreeTaskInput } from '$lib/tree-data';

	let { projectId, tasks: initialTasks }: { projectId: number; tasks: TreeTaskInput[] } = $props();

	let tasks = $state(initialTasks.map((t) => ({ ...t })));
	let collapsed = new SvelteSet<number>();
	let rows = $derived(flattenTree(tasks, collapsed));

	let inputEls: Record<number, HTMLInputElement> = {};
	let titleTimers: Record<number, ReturnType<typeof setTimeout>> = {};

	async function focusRow(taskId: number) {
		await tick();
		inputEls[taskId]?.focus();
	}

	function endpoint() {
		return resolve('/project/[id]/tree', { id: String(projectId) });
	}

	interface TreeApiBody {
		ok?: boolean;
		error?: string;
		newTaskId?: number;
		tasks?: TreeTaskInput[];
	}

	async function send(method: 'POST' | 'PATCH' | 'DELETE', requestBody: unknown) {
		const response = await fetch(endpoint(), {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(requestBody)
		});
		const body = (await response.json()) as TreeApiBody;
		return { ok: response.ok, body };
	}

	async function createAfter(afterTaskId: number | null, parentId: number | null) {
		const { body } = await send('POST', { parentId, afterTaskId });
		if (body.tasks) tasks = body.tasks;
		if (body.newTaskId !== undefined) await focusRow(body.newTaskId);
	}

	function handleAddRootTask() {
		createAfter(null, null);
	}

	function handleTitleInput(taskId: number, value: string) {
		const task = tasks.find((t) => t.id === taskId);
		if (task) task.title = value;
		clearTimeout(titleTimers[taskId]);
		titleTimers[taskId] = setTimeout(() => {
			send('PATCH', { type: 'title', taskId, title: value });
		}, 400);
	}

	function flushTitle(taskId: number) {
		clearTimeout(titleTimers[taskId]);
		const task = tasks.find((t) => t.id === taskId);
		if (!task) return Promise.resolve();
		return send('PATCH', { type: 'title', taskId, title: task.title });
	}

	async function handleIndent(taskId: number) {
		const { body } = await send('PATCH', { type: 'indent', taskId });
		if (body.tasks) tasks = body.tasks;
		await focusRow(taskId);
	}

	async function handleOutdent(taskId: number) {
		const { body } = await send('PATCH', { type: 'outdent', taskId });
		if (body.tasks) tasks = body.tasks;
		await focusRow(taskId);
	}

	async function handleBackspaceEmpty(taskId: number) {
		const rowIndex = rows.findIndex((r) => r.id === taskId);
		if (rowIndex <= 0) return;
		if (rows[rowIndex].hasChildren) return;
		const previousRow = rows[rowIndex - 1];
		const { ok } = await send('DELETE', { taskId });
		if (!ok) return;
		tasks = tasks.filter((t) => t.id !== taskId);
		await focusRow(previousRow.id);
	}

	async function handleKeydown(e: KeyboardEvent, taskId: number) {
		if (e.key === 'Enter') {
			e.preventDefault();
			const row = rows.find((r) => r.id === taskId);
			if (row) {
				await flushTitle(taskId);
				createAfter(taskId, row.parentId);
			}
		} else if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			await flushTitle(taskId);
			handleIndent(taskId);
		} else if (e.key === 'Tab' && e.shiftKey) {
			e.preventDefault();
			await flushTitle(taskId);
			handleOutdent(taskId);
		} else if (e.key === 'Backspace') {
			const input = e.target as HTMLInputElement;
			if (input.value === '' && input.selectionStart === 0) {
				e.preventDefault();
				handleBackspaceEmpty(taskId);
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			const idx = rows.findIndex((r) => r.id === taskId);
			if (idx > 0) inputEls[rows[idx - 1].id]?.focus();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			const idx = rows.findIndex((r) => r.id === taskId);
			if (idx >= 0 && idx < rows.length - 1) inputEls[rows[idx + 1].id]?.focus();
		}
	}

	function toggleCollapse(taskId: number) {
		if (collapsed.has(taskId)) collapsed.delete(taskId);
		else collapsed.add(taskId);
	}
</script>

<div class="task-tree">
	{#each rows as row (row.id)}
		<div class="tree-row" style={`padding-left: ${row.depth * 20}px`}>
			{#if row.hasChildren}
				<button
					type="button"
					class="chevron"
					onclick={() => toggleCollapse(row.id)}
					aria-label={collapsed.has(row.id) ? 'Expand' : 'Collapse'}
				>
					{collapsed.has(row.id) ? '▸' : '▾'}
				</button>
			{:else}
				<span class="chevron-spacer"></span>
			{/if}
			<span class="type-icon">{row.type === 'milestone' ? '◆' : '▢'}</span>
			<input
				class="title-input"
				bind:this={inputEls[row.id]}
				value={tasks.find((t) => t.id === row.id)?.title ?? ''}
				oninput={(e) => handleTitleInput(row.id, (e.target as HTMLInputElement).value)}
				onblur={() => flushTitle(row.id)}
				onkeydown={(e) => handleKeydown(e, row.id)}
			/>
		</div>
	{/each}
	<button type="button" class="btn btn-outline-primary btn-sm add-task" onclick={handleAddRootTask}>
		+ New task
	</button>
</div>

<style>
	.tree-row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding-top: 0.15rem;
		padding-bottom: 0.15rem;
	}
	.chevron,
	.chevron-spacer {
		width: 1.25rem;
		flex: none;
	}
	.chevron {
		border: none;
		background: none;
		cursor: pointer;
	}
	.type-icon {
		flex: none;
	}
	.title-input {
		flex: 1;
		border: 1px solid transparent;
		background: transparent;
		padding: 0.1rem 0.25rem;
	}
	.title-input:focus {
		border-color: #ccc;
		outline: none;
		background: white;
	}
	.add-task {
		margin-top: 0.5rem;
		margin-left: 1.5rem;
	}
</style>
