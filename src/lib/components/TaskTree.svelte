<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { flattenTree, type TreeTaskInput } from '$lib/tree-data';

	let {
		projectId,
		tasks: initialTasks
	}: { projectId: number; tasks: Omit<TreeTaskInput, 'clientKey'>[] } = $props();

	let tasks = $state(initialTasks.map((t) => ({ ...t, clientKey: t.id })));
	let collapsed = new SvelteSet<number>();
	let rows = $derived(flattenTree(tasks, collapsed));

	let inputEls: Record<number, HTMLInputElement> = {};
	let titleTimers: Record<number, ReturnType<typeof setTimeout>> = {};
	let nextTempId = -1;

	/**
	 * Serializes every server-confirming operation (creation, indent, outdent,
	 * delete, title flush) so that a row's own creation always resolves before any
	 * later action on that same row is sent to the server - even though the local,
	 * optimistic insert + focus-move for Enter happens immediately, outside this
	 * chain, so a fast typist's next keystrokes always have a real input to land in.
	 */
	let mutationChain: Promise<void> = Promise.resolve();
	function chain(fn: () => Promise<void>): Promise<void> {
		const next = mutationChain.then(fn, fn);
		mutationChain = next.then(
			() => undefined,
			() => undefined
		);
		return next;
	}

	async function focusRow(clientKey: number) {
		await tick();
		inputEls[clientKey]?.focus();
	}

	function endpoint() {
		return resolve('/project/[id]/tree', { id: String(projectId) });
	}

	interface TreeApiBody {
		ok?: boolean;
		error?: string;
		newTaskId?: number;
		tasks?: Omit<TreeTaskInput, 'clientKey'>[];
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

	function currentTask(clientKey: number) {
		return tasks.find((t) => t.clientKey === clientKey);
	}

	/** Merges a fresh authoritative list from the server, preserving each row's
	 * stable clientKey and keeping any not-yet-confirmed optimistic rows (negative
	 * id) that the server doesn't know about yet. */
	function mergeServerTasks(serverTasks: Omit<TreeTaskInput, 'clientKey'>[]): TreeTaskInput[] {
		const clientKeyByRealId = new Map(tasks.filter((t) => t.id >= 0).map((t) => [t.id, t.clientKey]));
		const confirmed = serverTasks.map((t) => ({ ...t, clientKey: clientKeyByRealId.get(t.id) ?? t.id }));
		const stillPending = tasks.filter((t) => t.id < 0);
		return [...confirmed, ...stillPending];
	}

	function siblingsOf(parentId: number | null) {
		return tasks.filter((t) => t.parentId === parentId).sort((a, b) => a.treeRank - b.treeRank || a.id - b.id);
	}

	function insertOptimistic(afterId: number | null, parentId: number | null) {
		const siblings = siblingsOf(parentId);
		const afterIndex = afterId === null ? siblings.length - 1 : siblings.findIndex((t) => t.id === afterId);
		const beforeRank = afterIndex >= 0 ? siblings[afterIndex].treeRank : -1;
		const afterRank = afterIndex + 1 < siblings.length ? siblings[afterIndex + 1].treeRank : beforeRank + 2;
		const clientKey = nextTempId--;
		tasks = [
			...tasks,
			{ id: clientKey, clientKey, parentId, treeRank: (beforeRank + afterRank) / 2, title: '', type: 'task' }
		];
		return clientKey;
	}

	async function createAfter(afterClientKey: number | null, parentId: number | null) {
		const afterId = afterClientKey === null ? null : currentTask(afterClientKey)?.id ?? null;
		const newClientKey = insertOptimistic(afterId, parentId);
		focusRow(newClientKey);
		await chain(async () => {
			const resolvedAfterId = afterClientKey === null ? null : currentTask(afterClientKey)?.id ?? null;
			const { body } = await send('POST', { parentId, afterTaskId: resolvedAfterId });
			if (body.newTaskId === undefined) return;
			tasks = tasks.map((t) => (t.clientKey === newClientKey ? { ...t, id: body.newTaskId! } : t));
		});
	}

	function handleAddRootTask() {
		createAfter(null, null);
	}

	function handleTitleInput(clientKey: number, value: string) {
		const task = currentTask(clientKey);
		if (task) task.title = value;
		clearTimeout(titleTimers[clientKey]);
		titleTimers[clientKey] = setTimeout(() => {
			flushTitle(clientKey);
		}, 400);
	}

	function flushTitle(clientKey: number) {
		clearTimeout(titleTimers[clientKey]);
		return chain(async () => {
			const task = currentTask(clientKey);
			if (!task || task.id < 0) return;
			await send('PATCH', { type: 'title', taskId: task.id, title: task.title });
		});
	}

	function handleIndent(clientKey: number) {
		return chain(async () => {
			const task = currentTask(clientKey);
			if (!task || task.id < 0) return;
			const { body } = await send('PATCH', { type: 'indent', taskId: task.id });
			if (body.tasks) tasks = mergeServerTasks(body.tasks);
			await focusRow(clientKey);
		});
	}

	function handleOutdent(clientKey: number) {
		return chain(async () => {
			const task = currentTask(clientKey);
			if (!task || task.id < 0) return;
			const { body } = await send('PATCH', { type: 'outdent', taskId: task.id });
			if (body.tasks) tasks = mergeServerTasks(body.tasks);
			await focusRow(clientKey);
		});
	}

	function handleBackspaceEmpty(clientKey: number) {
		const rowIndex = rows.findIndex((r) => r.clientKey === clientKey);
		if (rowIndex <= 0) return;
		if (rows[rowIndex].hasChildren) return;
		const previousClientKey = rows[rowIndex - 1].clientKey;
		return chain(async () => {
			const task = currentTask(clientKey);
			if (!task) return;
			if (task.id >= 0) {
				const { ok } = await send('DELETE', { taskId: task.id });
				if (!ok) return;
			}
			tasks = tasks.filter((t) => t.clientKey !== clientKey);
			await focusRow(previousClientKey);
		});
	}

	function handleKeydown(e: KeyboardEvent, row: { clientKey: number; parentId: number | null }) {
		if (e.key === 'Enter') {
			e.preventDefault();
			flushTitle(row.clientKey);
			createAfter(row.clientKey, row.parentId);
		} else if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			flushTitle(row.clientKey);
			handleIndent(row.clientKey);
		} else if (e.key === 'Tab' && e.shiftKey) {
			e.preventDefault();
			flushTitle(row.clientKey);
			handleOutdent(row.clientKey);
		} else if (e.key === 'Backspace') {
			const input = e.target as HTMLInputElement;
			if (input.value === '' && input.selectionStart === 0) {
				e.preventDefault();
				handleBackspaceEmpty(row.clientKey);
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			const idx = rows.findIndex((r) => r.clientKey === row.clientKey);
			if (idx > 0) inputEls[rows[idx - 1].clientKey]?.focus();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			const idx = rows.findIndex((r) => r.clientKey === row.clientKey);
			if (idx >= 0 && idx < rows.length - 1) inputEls[rows[idx + 1].clientKey]?.focus();
		}
	}

	function toggleCollapse(taskId: number) {
		if (collapsed.has(taskId)) collapsed.delete(taskId);
		else collapsed.add(taskId);
	}
</script>

<div class="task-tree">
	{#each rows as row (row.clientKey)}
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
				bind:this={inputEls[row.clientKey]}
				value={tasks.find((t) => t.clientKey === row.clientKey)?.title ?? ''}
				oninput={(e) => handleTitleInput(row.clientKey, (e.target as HTMLInputElement).value)}
				onblur={() => flushTitle(row.clientKey)}
				onkeydown={(e) => handleKeydown(e, row)}
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
