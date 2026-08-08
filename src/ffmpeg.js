import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { UserFacingError } from './util.js';

let cachedFfmpegPath;
let usingBundledFfmpeg = false;

/**
 * ffmpeg-static is an optional dependency, so this resolves to null whenever it
 * was skipped (`npm install --omit=optional`) or never installed at all.
 * Required synchronously because the whole detection path is synchronous.
 */
function bundledFfmpeg() {
	try {
		const path = createRequire(import.meta.url)('ffmpeg-static');
		return typeof path === 'string' && path ? path : null;
	} catch {
		return null;
	}
}

/**
 * Detection order: FFMPEG_PATH, then whatever is on PATH, then the bundled
 * build. A system ffmpeg is preferred deliberately — the static builds crash on
 * some systems (WSL2 in particular), so they are the last resort, not the first.
 */
export function findFfmpeg() {
	if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;

	const candidates = [process.env.FFMPEG_PATH, 'ffmpeg', bundledFfmpeg()].filter(Boolean);

	for (const candidate of candidates) {
		const probe = spawnSync(candidate, ['-version'], { stdio: 'ignore' });
		if (probe.status === 0) {
			cachedFfmpegPath = candidate;
			usingBundledFfmpeg = candidate !== process.env.FFMPEG_PATH && candidate !== 'ffmpeg';
			return cachedFfmpegPath;
		}
	}

	cachedFfmpegPath = null;
	return cachedFfmpegPath;
}

/** True when the binary in use is the bundled one rather than a system install. */
export function isUsingBundledFfmpeg() {
	findFfmpeg();
	return usingBundledFfmpeg;
}

export function requireFfmpeg() {
	const ffmpegPath = findFfmpeg();
	if (ffmpegPath) return ffmpegPath;

	throw new UserFacingError(
		'No usable ffmpeg was found.',
		[
			'Install it, e.g.  sudo apt install ffmpeg   (Debian/Ubuntu)',
			'                  brew install ffmpeg       (macOS)',
			'                  winget install ffmpeg     (Windows)',
			'or let npm supply one:  npm install ffmpeg-static',
			'or point the tool at a binary:  export FFMPEG_PATH=/path/to/ffmpeg',
		].join('\n  ')
	);
}

/** Parse the key=value blocks emitted by `ffmpeg -progress pipe:1`. */
function parseProgressChunk(text) {
	const stats = {};
	for (const line of text.split(/\r?\n/)) {
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		stats[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
	}
	return stats;
}

/** Exported so the argument construction — notably the --from/--to maths — is testable. */
export function buildArgs({ url, output, from, to, faststart }) {
	const args = ['-hide_banner', '-loglevel', 'error'];

	// Long VODs are streamed over HTTP for hours; survive transient drops. These
	// belong to the HTTP protocol handler — ffmpeg rejects them outright for any
	// other input, so only add them when the source really is a URL.
	if (/^https?:/i.test(url)) {
		args.push(
			'-reconnect', '1',
			'-reconnect_streamed', '1',
			'-reconnect_delay_max', '10'
		);
	}

	// Placed before -i so ffmpeg seeks instead of decoding through the skipped part.
	if (from != null) args.push('-ss', String(from));

	args.push('-i', url);

	if (to != null) args.push('-t', String(to - (from ?? 0)));

	// Stream copy: no re-encoding, so this is limited by network, not CPU.
	args.push('-c', 'copy');
	if (faststart) args.push('-movflags', '+faststart');

	args.push('-progress', 'pipe:1', '-nostats', '-y', output);

	return args;
}

/**
 * Run ffmpeg and report progress. Resolves once the file is written.
 *
 * onProgress receives { seconds, bytes, speed, ratio } where ratio is null
 * when the total duration is unknown.
 */
export function download({ url, output, durationSec, from, to, faststart = false, onProgress }) {
	const ffmpegPath = requireFfmpeg();
	const args = buildArgs({ url, output, from, to, faststart });

	const expectedDuration =
		to != null ? to - (from ?? 0) : durationSec != null ? durationSec - (from ?? 0) : null;

	return new Promise((resolve, reject) => {
		const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

		let stderrTail = [];
		let interrupted = false;
		// Last position ffmpeg reported, so the caller can tell an empty result
		// from a real one — ffmpeg exits 0 either way.
		let writtenSeconds = 0;

		// Ctrl+C: ask ffmpeg to finalise the container so the partial file stays playable.
		const onSigint = () => {
			interrupted = true;
			child.kill('SIGINT');
		};
		process.on('SIGINT', onSigint);

		child.stdout.on('data', (chunk) => {
			const stats = parseProgressChunk(chunk.toString());
			const microseconds = Number(stats.out_time_us ?? stats.out_time_ms);
			if (!Number.isFinite(microseconds)) return;

			const seconds = microseconds / 1_000_000;
			writtenSeconds = Math.max(writtenSeconds, seconds);

			if (!onProgress) return;
			onProgress({
				seconds,
				bytes: Number(stats.total_size) || 0,
				speed: parseFloat(stats.speed) || 0,
				ratio: expectedDuration ? Math.min(seconds / expectedDuration, 1) : null,
			});
		});

		child.stderr.on('data', (chunk) => {
			stderrTail.push(chunk.toString());
			if (stderrTail.length > 20) stderrTail = stderrTail.slice(-20);
		});

		child.on('error', (err) => {
			process.off('SIGINT', onSigint);
			reject(new UserFacingError(`Could not run ffmpeg: ${err.message}`));
		});

		child.on('close', (code, signal) => {
			process.off('SIGINT', onSigint);

			if (interrupted) {
				resolve({ output, interrupted: true, seconds: writtenSeconds });
				return;
			}
			if (code === 0) {
				resolve({ output, interrupted: false, seconds: writtenSeconds });
				return;
			}

			const detail = stderrTail.join('').trim().split('\n').slice(-5).join('\n  ');

			// The prebuilt static binaries segfault on some kernels — WSL2 most
			// notably — where a distribution build runs fine.
			if (signal === 'SIGSEGV' && isUsingBundledFfmpeg()) {
				reject(
					new UserFacingError(
						'The bundled ffmpeg crashed (segmentation fault).',
						'This build is known to fail on some systems, WSL2 among them. Install your system ffmpeg — it is preferred automatically:  sudo apt install ffmpeg'
					)
				);
				return;
			}

			reject(
				new UserFacingError(
					signal ? `ffmpeg was killed by ${signal}.` : `ffmpeg failed (exit code ${code}).`,
					detail || undefined
				)
			);
		});
	});
}
