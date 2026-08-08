import assert from 'node:assert/strict';
import test from 'node:test';

import { formatProgress, formatRate } from '../src/ui.js';

test('formatRate renders bytes per second', () => {
	assert.equal(formatRate(38_200_000), '36.4 MB/s');
	assert.equal(formatRate(0), '');
	assert.equal(formatRate(NaN), '');
});

test('formatProgress shows position, size and rate on two lines', () => {
	const lines = formatProgress({
		ratio: 0.163,
		seconds: 4767,
		totalSeconds: 29265,
		bytes: 4.5 * 1024 ** 3,
		totalBytes: 27.6 * 1024 ** 3,
		rate: 40_000_000,
		speed: 93.7,
		width: 100,
	});

	assert.equal(lines.length, 2);
	assert.match(lines[0], /16\.3%/);
	assert.match(lines[0], /ETA/);
	assert.match(lines[1], /01:19:27 \/ 08:07:45/);
	assert.match(lines[1], /4\.5 GB \/ ~27\.6 GB/);
	assert.match(lines[1], /MB\/s/);
	assert.match(lines[1], /93\.7x realtime/);
});

test('formatProgress falls back to one line on a narrow terminal', () => {
	const lines = formatProgress({
		ratio: 0.5,
		seconds: 60,
		totalSeconds: 120,
		bytes: 1000,
		totalBytes: 2000,
		rate: 500,
		speed: 10,
		width: 50,
	});
	assert.equal(lines.length, 1);
});

test('formatProgress copes with an unknown total', () => {
	const lines = formatProgress({
		ratio: null,
		seconds: 30,
		totalSeconds: null,
		bytes: 1024,
		totalBytes: null,
		rate: 0,
		speed: 0,
		width: 100,
	});
	assert.ok(lines.every((line) => !line.includes('NaN')));
	assert.ok(!lines.join(' ').includes('/ ~'));
});
