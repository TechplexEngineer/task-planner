<script lang="ts">
	import { Gantt, Willow } from 'wx-svelte-gantt';
	import { toGanttTasks, toGanttLinks } from '$lib/gantt-data';
	import GanttTaskBar from '$lib/components/GanttTaskBar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let tasks = $derived(toGanttTasks(data.project.startDate, data.tasks));
	let links = $derived(toGanttLinks(data.dependencies));
</script>

<h2>Gantt</h2>

<div class="gantt-container">
	<Willow>
		<Gantt {tasks} {links} readonly taskTemplate={GanttTaskBar} />
	</Willow>
</div>

<style>
	.gantt-container {
		height: 600px;
	}
</style>
