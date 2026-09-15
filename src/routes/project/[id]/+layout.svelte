<script lang="ts">
	let { data, children } = $props();
</script>

<h1>{data.project.name}</h1>

<nav>
	<a href={resolve('/project/[id]/list', { id: String(data.project.id) })}>List</a>
	<a href={resolve('/project/[id]/gantt', { id: String(data.project.id) })}>Gantt</a>
</nav>

{@render children()}
