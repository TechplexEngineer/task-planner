<script lang="ts">
	import TaskTree from '$lib/components/TaskTree.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h2>Tree</h2>

<TaskTree projectId={data.project.id} tasks={data.tasks} />
