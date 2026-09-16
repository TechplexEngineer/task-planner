<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	let project = $derived(page.data.project as { id: number; name: string } | undefined);
	let currentMode = $derived(page.url.pathname.split('/').pop());
</script>

<nav class="navbar navbar-expand-lg navbar-dark bg-dark mb-3">
	<div class="container-fluid">
		<a class="navbar-brand" href={resolve('/')}>Task Graph</a>
		<button
			class="navbar-toggler"
			type="button"
			data-bs-toggle="collapse"
			data-bs-target="#navbar-content"
			aria-controls="navbar-content"
			aria-expanded="false"
			aria-label="Toggle navigation"
		>
			<span class="navbar-toggler-icon"></span>
		</button>
		<div class="collapse navbar-collapse" id="navbar-content">
			{#if project}
				<ul class="navbar-nav me-auto">
					<li class="nav-item">
						<a
							class="nav-link"
							class:active={currentMode === 'list'}
							href={resolve('/project/[id]/list', { id: String(project.id) })}
						>
							List
						</a>
					</li>
					<li class="nav-item">
						<a
							class="nav-link"
							class:active={currentMode === 'graph'}
							href={resolve('/project/[id]/graph', { id: String(project.id) })}
						>
							Graph
						</a>
					</li>
					<li class="nav-item">
						<a
							class="nav-link"
							class:active={currentMode === 'gantt'}
							href={resolve('/project/[id]/gantt', { id: String(project.id) })}
						>
							Gantt
						</a>
					</li>
				</ul>
				<span class="navbar-text me-3">{project.name}</span>
				<a class="btn btn-outline-light btn-sm" href={resolve('/')}>All projects</a>
			{/if}
		</div>
	</div>
</nav>
