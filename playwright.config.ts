import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testMatch: '**/*.e2e.{ts,js}',
	// This suite shares one local D1 file and drives it through a shared
	// "All projects" list page that multiple specs navigate through by
	// clicking a link. Running workers in parallel causes cross-test
	// mutation of that shared state, so this suite is only reliable
	// single-worker.
	workers: 1
});
