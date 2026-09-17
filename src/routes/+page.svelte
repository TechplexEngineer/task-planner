<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1>Projects</h1>

<ul>
	{#each data.projects as project (project.id)}
		<li>
			<a href={resolve('/project/[id]/list', { id: String(project.id) })}>{project.name}</a>
		</li>
	{/each}
</ul>

<form method="POST" action="?/create" use:enhance>
	<input
		type="text"
		name="name"
		placeholder="New project name"
		aria-label="New project name"
		required
		class="form-control"
	/>
	<button type="submit" class="btn btn-primary">Create project</button>
</form>
