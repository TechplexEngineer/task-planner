<script lang="ts">
	import { Gantt, Willow, type IApi } from 'wx-svelte-gantt';
	import { toGanttTasks, toGanttLinks, dateToOffsetDays } from '$lib/gantt-data';
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

	const columns = [
		{ id: 'text', header: 'Task', flexgrow: 1, editor: 'text' },
		{ id: 'start', header: 'Start', width: 110, editor: { type: 'datepicker' } }
	];

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
		// Dragging a bar can mean three different things - moving it, resizing its
		// left edge, or resizing its right edge - and the pixel math to tell a move
		// from a left-edge resize apart is ambiguous. Rather than guess, chart
		// dragging stays limited to right-edge resize (changing duration); moving a
		// task's date goes through the explicit "Start" grid column instead, which
		// commits an unambiguous date. Block any drag that would move the bar's
		// left edge (a whole-bar move or a left-edge resize).
		api.intercept('drag-task', (ev) => {
			if (ev.left === undefined) return;
			const task = api.getTask(ev.id);
			if (ev.left !== task.$x) return false;
		});

		// The "Task" and "Start" grid columns are the only editable surfaces
		// (the chart itself stays drag-locked, see the intercept above); each
		// commits by firing this same update-task event, but the grid always
		// hands back the *whole* row - text and start included - regardless of
		// which single cell was actually edited. Compare against the value the
		// bar was last rendered with to tell which field genuinely changed.
		api.on('update-task', async (ev) => {
			const previous = tasks.find((t) => t.id === ev.id);
			if (!previous) return;
			if (
				typeof ev.task?.text === 'string' &&
				ev.task.text.trim() !== '' &&
				ev.task.text !== previous.text
			) {
				await patchGantt({ type: 'title', taskId: ev.id, title: ev.task.text });
				return;
			}
			if (ev.task?.start instanceof Date && ev.task.start.getTime() !== previous.start.getTime()) {
				const requestedStartOffsetDays = dateToOffsetDays(data.project.startDate, ev.task.start);
				await patchGantt({ type: 'delay', taskId: ev.id, requestedStartOffsetDays });
				return;
			}
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
