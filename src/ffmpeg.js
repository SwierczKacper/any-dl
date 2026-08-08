import { spawn, spawnSync } from 'node:child_process';
import { UserFacingError } from './util.js';

let cachedFfmpegPath;

export function findFfmpeg() {
	if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;

	for (const candidate of [process.env.FFMPEG_PATH, 'ffmpeg'].filter(Boolean)) {
		const probe = spawnSync(candidate, ['-version'], { stdio: 'ignore' });
		if (probe.status === 0) {
			cachedFfmpegPath = candidate;
			return cachedFfmpegPath;
		}
	}

	cachedFfmpegPath = null;
	return cachedFfmpegPath;
}

export function requireFfmpeg() {
	const ffmpegPath = findFfmpeg();
	if (ffmpegPath) return ffmpegPath;

	throw new UserFacingError(
		'ffmpeg was not found on your PATH.',
		[
			'Install it, e.g.  sudo apt install ffmpeg   (Debian/Ubuntu)',
			'                  brew install ffmpeg       (macOS)',
			'                  winget install ffmpeg     (Windows)',
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

	// Long VODs are streamed over HTTP for hours; survive transient drops.
	args.push(
		'-reconnect', '1',
		'-reconnect_streamed', '1',
		'-reconnect_delay_max', '10'
	);

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

		// Ctrl+C: ask ffmpeg to finalise the container so the partial file stays playable.
		const onSigint = () => {
			interrupted = true;
			child.kill('SIGINT');
		};
		process.on('SIGINT', onSigint);

		child.stdout.on('data', (chunk) => {
			if (!onProgress) return;
			const stats = parseProgressChunk(chunk.toString());
			const microseconds = Number(stats.out_time_us ?? stats.out_time_ms);
			if (!Number.isFinite(microseconds)) return;

			const seconds = microseconds / 1_000_000;
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

		child.on('close', (code) => {
			process.off('SIGINT', onSigint);

			if (interrupted) {
				resolve({ output, interrupted: true });
				return;
			}
			if (code === 0) {
				resolve({ output, interrupted: false });
				return;
			}

			const detail = stderrTail.join('').trim().split('\n').slice(-5).join('\n  ');
			reject(new UserFacingError(`ffmpeg failed (exit code ${code}).`, detail || undefined));
		});
	});
}
