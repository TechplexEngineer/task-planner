<script lang="ts">
	import { resolve } from '$app/paths';

	let { data, children } = $props();
</script>

<p><a href={resolve('/')}>&larr; All projects</a></p>
<h1>{data.project.name}</h1>

{@render children()}
