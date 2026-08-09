import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildArgs, download, findFfmpeg, isUsingBundledFfmpeg } from '../src/ffmpeg.js';

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

// The empty-output bug lived here: ffmpeg exits 0 having written only a
// container header, so the caller needs the reported position to tell the
// difference. These run against a locally generated file — no network.
const FFMPEG = findFfmpeg();
const SKIP_INTEGRATION = FFMPEG ? false : 'requires ffmpeg on PATH';

function makeSampleVideo(dir) {
	const path = join(dir, 'sample.mp4');
	const result = spawnSync(
		FFMPEG,
		['-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=10', '-c:v', 'mpeg4', path],
		{ stdio: 'ignore' }
	);
	return result.status === 0 ? path : null;
}

test('download reports how much it actually wrote', { skip: SKIP_INTEGRATION, timeout: 60_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'any-dl-ffmpeg-'));
	const source = makeSampleVideo(dir);
	if (!source) return; // this ffmpeg build cannot produce the fixture

	const result = await download({ url: source, output: join(dir, 'out.mp4') });

	assert.equal(result.interrupted, false);
	assert.ok(result.seconds > 2.5, `expected roughly 3 seconds, got ${result.seconds}`);
});

test('download reports ~0 seconds when the range yields no frames', { skip: SKIP_INTEGRATION, timeout: 60_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'any-dl-ffmpeg-'));
	const source = makeSampleVideo(dir);
	if (!source) return;

	// Starts past the end of the clip, so nothing can be copied.
	const result = await download({ url: source, output: join(dir, 'empty.mp4'), from: 30, to: 33 });

	assert.ok(result.seconds < 0.1, `expected an empty result, got ${result.seconds}`);
});

test('buildArgs omits reconnect flags for non-HTTP inputs', () => {
	// ffmpeg rejects these outright for the file protocol: "Option reconnect not found."
	const args = buildArgs({ url: '/tmp/local.mp4', output: 'out.mp4' });
	assert.ok(!args.includes('-reconnect'));
	assert.ok(!args.includes('-reconnect_delay_max'));
});

test('findFfmpeg prefers a system ffmpeg over the bundled build', { skip: SKIP_INTEGRATION }, () => {
	// The bundled static builds crash on some systems, so they must never win
	// when a distribution build is available.
	assert.equal(findFfmpeg(), 'ffmpeg');
	assert.equal(isUsingBundledFfmpeg(), false);
});

test('findFfmpeg returns something runnable', { skip: SKIP_INTEGRATION }, () => {
	const probe = spawnSync(findFfmpeg(), ['-version'], { stdio: 'ignore' });
	assert.equal(probe.status, 0);
});
