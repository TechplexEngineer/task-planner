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
			<form method="POST" action="?/rename" use:enhance>
				<input type="hidden" name="id" value={project.id} />
				<input type="text" name="name" value={project.name} aria-label="Rename project" />
				<button type="submit">Rename</button>
			</form>
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={project.id} />
				<button type="submit">Delete</button>
			</form>
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
	/>
	<button type="submit">Create project</button>
</form>
