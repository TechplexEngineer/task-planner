<script lang="ts">
	let { data, children } = $props();
</script>

<p><a href="/">&larr; All projects</a></p>
<h1>{data.project.name}</h1>

{@render children()}
