<script lang="ts">
	import { enhance } from '$app/forms';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import { findOrderViolations } from '$lib/order-validation';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let items = $derived(data.tasks.map((t) => ({ ...t })));

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
<form
	method="POST"
	action="?/createTask"
	use:enhance
	class="row row-cols-lg-auto g-2 align-items-center mb-3"
>
	<div class="col-12">
		<input type="text" name="title" placeholder="Title" required class="form-control" />
	</div>
	<div class="col-12">
		<textarea name="description" placeholder="Description" class="form-control" rows="1"></textarea>
	</div>
	<div class="col-12">
		<select name="type" class="form-select">
			<option value="task">Task</option>
			<option value="milestone">Milestone</option>
		</select>
	</div>
	<div class="col-12">
		<input type="number" name="durationDays" min="0" value="1" class="form-control" />
	</div>
	<div class="col-12">
		<button type="submit" class="btn btn-primary">Add</button>
	</div>
</form>
{#if form?.formName === 'createTask' && form.error}
	<p class="error">{form.error}</p>
{/if}

<h3>Import tasks</h3>
<form method="POST" action="?/importTasks" use:enhance class="mb-3">
	<div class="mb-2">
		<textarea
			name="lines"
			placeholder="One task per line. Each line depends on the line above it."
			class="form-control"
			rows="4"></textarea>
	</div>
	<button type="submit" class="btn btn-primary">Import</button>
</form>
{#if form?.formName === 'importTasks' && form.error}
	<p class="error">{form.error}</p>
{/if}

<h3>Add dependency</h3>
<form
	method="POST"
	action="?/createDependency"
	use:enhance
	class="row row-cols-lg-auto g-2 align-items-center mb-3"
>
	<div class="col-12">
		<select name="predecessorId" class="form-select">
			{#each data.tasks as task (task.id)}
				<option value={task.id}>{task.title}</option>
			{/each}
		</select>
	</div>
	<div class="col-12">
		<span class="col-form-label">must finish before</span>
	</div>
	<div class="col-12">
		<select name="successorId" class="form-select">
			{#each data.tasks as task (task.id)}
				<option value={task.id}>{task.title}</option>
			{/each}
		</select>
	</div>
	<div class="col-12">
		<button type="submit" class="btn btn-primary">Add dependency</button>
	</div>
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
