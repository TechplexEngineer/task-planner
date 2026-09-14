<script lang="ts">
	import { enhance } from '$app/forms';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { findOrderViolations } from '$lib/order-validation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let items = $state(data.tasks.map((t) => ({ ...t })));
	$effect(() => {
		items = data.tasks.map((t) => ({ ...t }));
	});

	let violatingTaskIds = $derived(findOrderViolations(data.tasks, data.dependencies));

	function handleConsider(e: CustomEvent<DndEvent<(typeof items)[number]>>) {
		items = e.detail.items;
	}

	let reorderForm: HTMLFormElement;
	let orderedIdsInput: HTMLInputElement;

	function handleFinalize(e: CustomEvent<DndEvent<(typeof items)[number]>>) {
		items = e.detail.items;
		orderedIdsInput.value = items.map((i) => i.id).join(',');
		reorderForm.requestSubmit();
	}
</script>

<h2>Task list</h2>

<ul
	use:dndzone={{ items, flipDurationMs: 150 }}
	onconsider={handleConsider}
	onfinalize={handleFinalize}
>
	{#each items as task (task.id)}
		<li class:critical={task.schedule.onCriticalPath}>
			<span>{task.type === 'milestone' ? '◆' : '▢'}</span>
			<strong>{task.title}</strong>
			<span>{task.status}</span>
			<span>{task.durationDays}d</span>
			{#if violatingTaskIds.has(task.id)}
				<span class="warning">⚠ ranked above a predecessor</span>
			{/if}
			<form method="POST" action="?/deleteTask" use:enhance>
				<input type="hidden" name="id" value={task.id} />
				<button type="submit">Delete</button>
			</form>
		</li>
	{/each}
</ul>

<form bind:this={reorderForm} method="POST" action="?/reorder" use:enhance>
	<input bind:this={orderedIdsInput} type="hidden" name="orderedIds" value="" />
</form>

<h3>Add task</h3>
<form method="POST" action="?/createTask" use:enhance>
	<input type="text" name="title" placeholder="Title" required />
	<textarea name="description" placeholder="Description"></textarea>
	<select name="type">
		<option value="task">Task</option>
		<option value="milestone">Milestone</option>
	</select>
	<input type="number" name="durationDays" min="0" value="1" />
	<button type="submit">Add</button>
</form>
{#if form?.formName === 'createTask' && form.error}
	<p class="error">{form.error}</p>
{/if}

<h3>Add dependency</h3>
<form method="POST" action="?/createDependency" use:enhance>
	<select name="predecessorId">
		{#each data.tasks as task (task.id)}
			<option value={task.id}>{task.title}</option>
		{/each}
	</select>
	<span>must finish before</span>
	<select name="successorId">
		{#each data.tasks as task (task.id)}
			<option value={task.id}>{task.title}</option>
		{/each}
	</select>
	<button type="submit">Add dependency</button>
</form>
{#if form?.formName === 'createDependency' && form.error}
	<p class="error">{form.error}</p>
{/if}

<h3>Dependencies</h3>
<ul>
	{#each data.dependencies as dep (dep.id)}
		<li>
			{data.tasks.find((t) => t.id === dep.predecessorId)?.title} &rarr;
			{data.tasks.find((t) => t.id === dep.successorId)?.title}
			<form method="POST" action="?/deleteDependency" use:enhance>
				<input type="hidden" name="id" value={dep.id} />
				<button type="submit">Remove</button>
			</form>
		</li>
	{/each}
</ul>

<style>
	.critical {
		outline: 2px solid crimson;
	}
	.warning {
		color: darkorange;
	}
</style>
