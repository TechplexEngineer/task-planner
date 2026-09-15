<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	let { data, children } = $props();
</script>

<p><a href={resolve('/')}>&larr; All projects</a></p>
<h1>{data.project.name}</h1>

<nav>
	<a
		href={resolve('/project/[id]/list', { id: String(data.project.id) })}
		aria-current={page.url.pathname.endsWith('/list') ? 'page' : undefined}
	>
		List
	</a>
	<a
		href={resolve('/project/[id]/graph', { id: String(data.project.id) })}
		aria-current={page.url.pathname.endsWith('/graph') ? 'page' : undefined}
	>
		Graph
	</a>
</nav>

{@render children()}
