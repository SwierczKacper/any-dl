import assert from 'node:assert/strict';
import test from 'node:test';

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

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

/**
 * Detection caches its answer in module scope, so a second question in this
 * process gets the first answer. A child process is the honest way to ask again
 * under a different environment.
 */
function detectWith(env) {
	// An absolute URL, so the child does not depend on the working directory
	// the runner happened to start in.
	const moduleUrl = new URL('../src/ffmpeg.js', import.meta.url).href;
	const probe = spawnSync(
		process.execPath,
		['-e', `import('${moduleUrl}').then((m) => console.log(m.findFfmpeg(), m.isUsingBundledFfmpeg()))`],
		{ env: { ...process.env, ...env }, encoding: 'utf8' }
	);
	const [path, bundled] = probe.stdout.trim().split(' ');
	return { path, bundled: bundled === 'true' };
}

const BUNDLED_PATH = (() => {
	try {
		return createRequire(import.meta.url)('ffmpeg-static');
	} catch {
		return null;
	}
})();

// Skipped where the bundled build was not installed, and where it was but does
// not run — which is the whole reason it is the last resort.
const SKIP_BUNDLED =
	BUNDLED_PATH && spawnSync(BUNDLED_PATH, ['-version'], { stdio: 'ignore' }).status === 0
		? false
		: 'requires a runnable bundled ffmpeg';

test('the bundled build is recognised even when FFMPEG_PATH points at it', { skip: SKIP_BUNDLED }, () => {
	// It is the same binary with the same crash, so the segfault hint has to
	// appear for it. Inferring "not bundled" from the slot it was found in got
	// this wrong and left the user with a bare "killed by SIGSEGV".
	const { path, bundled } = detectWith({ FFMPEG_PATH: BUNDLED_PATH });
	assert.equal(path, BUNDLED_PATH);
	assert.equal(bundled, true);
});

test('a system ffmpeg is not mistaken for the bundled one', { skip: SKIP_INTEGRATION }, () => {
	const { bundled } = detectWith({ FFMPEG_PATH: '' });
	assert.equal(bundled, false);
});

test('findFfmpeg returns something runnable', { skip: SKIP_INTEGRATION }, () => {
	const probe = spawnSync(findFfmpeg(), ['-version'], { stdio: 'ignore' });
	assert.equal(probe.status, 0);
});
