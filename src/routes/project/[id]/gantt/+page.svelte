<script lang="ts">
	import { Gantt, Willow, type IApi } from 'wx-svelte-gantt';
	import { toGanttTasks, toGanttLinks } from '$lib/gantt-data';
	import GanttTaskBar from '$lib/components/GanttTaskBar.svelte';
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Not a writable $derived: schedule is mutated in place after a duration-resize
	// or reorder round-trip so the Gantt tasks below pick up the recomputed dates
	// without waiting for a full page reload. See graph/+page.svelte for the same
	// pattern and why $state's deep reactivity (not $derived) is required here.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let projectTasks = $state(data.tasks.map((t) => ({ ...t })));
	$effect(() => {
		projectTasks = data.tasks.map((t) => ({ ...t }));
	});

	let tasks = $derived(toGanttTasks(data.project.startDate, projectTasks));
	let links = $derived(toGanttLinks(data.dependencies));

	const columns = [{ id: 'text', header: 'Task', flexgrow: 1 }];

	async function patchGantt(body: Record<string, unknown>) {
		await fetch(resolve('/project/[id]/gantt', { id: String(data.project.id) }), {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		// Keep the shared project layout data (used by the list and graph views too)
		// in sync, since this raw fetch bypasses the invalidation a form's
		// use:enhance would normally trigger.
		await invalidateAll();
	}

	function initGantt(api: IApi) {
		// Task start dates are computed by the critical-path scheduler from each
		// task's duration and its predecessors - they aren't a stored field, so a
		// task can't be moved to an arbitrary date. Only resizing a bar's end
		// (changing its duration) maps to real data; block any drag that would
		// move the bar's left edge (a whole-bar move or a left-edge resize).
		api.intercept('drag-task', (ev) => {
			if (ev.left === undefined) return;
			const task = api.getTask(ev.id);
			if (ev.left !== task.$x) return false;
		});

		// A blocked drag-task never produces a matching update-task, so any diff
		// that reaches here came from an allowed end-edge resize.
		api.on('update-task', async (ev) => {
			if (typeof ev.diff !== 'number' || !ev.diff) return;
			const task = projectTasks.find((t) => t.id === ev.id);
			if (!task) return;
			const durationDays = Math.max(1, task.durationDays + ev.diff);
			await patchGantt({ type: 'duration', taskId: ev.id, durationDays });
		});

		api.on('move-task', async (ev) => {
			if (ev.inProgress) return;
			const state = api.serialize({ data: 'tasks' }) as { id: number }[] | null;
			if (!state) return;
			await patchGantt({ type: 'reorder', orderedIds: state.map((t) => t.id) });
		});
	}
</script>

<h2>Gantt</h2>

<div class="gantt-container">
	<Willow>
		<Gantt {tasks} {links} {columns} taskTemplate={GanttTaskBar} init={initGantt} />
	</Willow>
</div>

<style>
	.gantt-container {
		height: 600px;
	}

	/* Dependency creation has its own dedicated flow in the list view, and there's
	   no progress field on a task, so these library-native handles aren't wired
	   to anything - hide them. */
	.gantt-container :global(.wx-link),
	.gantt-container :global(.wx-progress-marker) {
		display: none;
	}
</style>
