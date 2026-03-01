import { test, expect } from '@playwright/test';

test.describe('YouTube Validate API', () => {

	test('valid YouTube URL returns metadata', async ({ request }) => {
		const response = await request.post('/api/youtube/validate', {
			data: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
		});

		expect(response.status()).toBe(200);

		const data = await response.json();
		expect(data.videoId).toBe('dQw4w9WgXcQ');
		expect(data.title).toBeTruthy();
		expect(data.channelName).toBeTruthy();
		expect(data.thumbnail).toBeTruthy();
	});

	test('short YouTube URL format works', async ({ request }) => {
		const response = await request.post('/api/youtube/validate', {
			data: { url: 'https://youtu.be/dQw4w9WgXcQ' }
		});

		expect(response.status()).toBe(200);

		const data = await response.json();
		expect(data.videoId).toBe('dQw4w9WgXcQ');
		expect(data.title).toBeTruthy();
	});

	test('invalid YouTube URL returns 400', async ({ request }) => {
		const response = await request.post('/api/youtube/validate', {
			data: { url: 'https://www.example.com/not-youtube' }
		});

		expect(response.status()).toBe(400);

		const data = await response.json();
		expect(data.error).toContain('Invalid YouTube URL');
	});

	test('missing URL returns 400', async ({ request }) => {
		const response = await request.post('/api/youtube/validate', {
			data: {}
		});

		expect(response.status()).toBe(400);

		const data = await response.json();
		expect(data.error).toContain('URL is required');
	});

	test('non-existent video returns 404', async ({ request }) => {
		const response = await request.post('/api/youtube/validate', {
			data: { url: 'https://www.youtube.com/watch?v=XXXXXXXXXXX' }
		});

		expect(response.status()).toBe(404);

		const data = await response.json();
		expect(data.error).toBeTruthy();
	});
});
