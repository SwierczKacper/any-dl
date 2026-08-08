import assert from 'node:assert/strict';
import test from 'node:test';

import { buildArgs } from '../src/ffmpeg.js';

const BASE = { url: 'https://cdn.example.com/playlist.m3u8', output: 'out.mp4' };

/** Read the value that follows a flag, so tests don't depend on argument order. */
function valueAfter(args, flag) {
	const index = args.indexOf(flag);
	return index === -1 ? undefined : args[index + 1];
}

test('buildArgs stream-copies instead of re-encoding', () => {
	const args = buildArgs(BASE);
	assert.equal(valueAfter(args, '-c'), 'copy');
});

test('buildArgs writes the output path last', () => {
	const args = buildArgs(BASE);
	assert.equal(args.at(-1), 'out.mp4');
});

test('buildArgs asks ffmpeg for machine-readable progress', () => {
	const args = buildArgs(BASE);
	assert.equal(valueAfter(args, '-progress'), 'pipe:1');
	assert.ok(args.includes('-nostats'));
});

test('buildArgs enables reconnects for long downloads', () => {
	const args = buildArgs(BASE);
	assert.equal(valueAfter(args, '-reconnect'), '1');
	assert.equal(valueAfter(args, '-reconnect_delay_max'), '10');
});

test('buildArgs puts -ss before -i so seeking is fast', () => {
	const args = buildArgs({ ...BASE, from: 3600 });
	assert.ok(args.indexOf('-ss') < args.indexOf('-i'), '-ss must precede -i');
	assert.equal(valueAfter(args, '-ss'), '3600');
});

test('buildArgs converts an end position into a duration', () => {
	// --from 01:00:00 --to 01:15:00 is a 900 second slice.
	const args = buildArgs({ ...BASE, from: 3600, to: 4500 });
	assert.equal(valueAfter(args, '-t'), '900');
});

test('buildArgs treats --to without --from as a duration from the start', () => {
	const args = buildArgs({ ...BASE, to: 20 });
	assert.equal(valueAfter(args, '-t'), '20');
	assert.ok(!args.includes('-ss'));
});

test('buildArgs omits trimming flags when no range is given', () => {
	const args = buildArgs(BASE);
	assert.ok(!args.includes('-ss'));
	assert.ok(!args.includes('-t'));
});

test('buildArgs only adds faststart when asked', () => {
	assert.ok(!buildArgs(BASE).includes('-movflags'));
	assert.equal(valueAfter(buildArgs({ ...BASE, faststart: true }), '-movflags'), '+faststart');
});
