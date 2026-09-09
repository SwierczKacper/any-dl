import { createWriteStream } from 'node:fs';
import { rm, stat, writeFile, readFile, truncate } from 'node:fs/promises';
import { USER_AGENT } from './http.js';
import { UserFacingError } from './util.js';

/**
 * Fetching a stream segment by segment, rather than handing ffmpeg the playlist
 * and hoping.
 *
 * Segments are fetched several at a time but written strictly in order, so the
 * partial file is always a valid prefix of the finished one. That ordering is
 * what makes the rest possible: a download can stop and be resumed from the
 * segment it reached, and a segment that fails can be retried on its own
 * instead of costing the whole stream.
 *
 * Concurrency is worth less than it looks — the measured gain is about 1.5x,
 * and it stops improving past eight, because by then a single connection is
 * already close to saturating a fast line. It matters most where round trips,
 * not bandwidth, are the limit.
 */

const DEFAULT_CONCURRENCY = 8;
const ATTEMPTS = 4;
const BACKOFF_MS = [500, 1500, 4000];
const STATE_VERSION = 1;
// A small file written repeatedly costs more than it saves; a crash loses at
// most this much work, which is recovered by truncating to the recorded size.
const STATE_INTERVAL_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Identifies a partial download well enough to refuse an unrelated one.
 *
 * Deliberately not the playlist URL: on both sites it carries a signature that
 * changes between runs, so it would never match itself. The segment path is
 * stable, and together with the count and duration it does not plausibly
 * collide with a different video.
 */
function signatureOf(segments, totalSeconds) {
	const first = new URL(segments[0].url);
	return `${segments.length}:${Math.round(totalSeconds)}:${first.pathname}`;
}

/**
 * Fetch one segment, reporting bytes as they arrive rather than at the end.
 *
 * Segments are ten seconds of video each, so on a slow line one takes several
 * seconds to arrive — long enough that a progress bar updated only on
 * completion would sit still and then jump. `onBytes` is called with each
 * chunk, and with a negative delta if an attempt is abandoned, so the total
 * never counts a discarded partial segment.
 */
async function fetchSegment(url, signal, onBytes) {
	let lastError;

	for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
		if (signal?.aborted) throw new Error('aborted');

		let received = 0;
		try {
			const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal });
			if (!response.ok) {
				const error = new Error(`HTTP ${response.status}`);
				error.status = response.status;
				throw error;
			}

			const chunks = [];
			for await (const chunk of response.body) {
				chunks.push(chunk);
				received += chunk.length;
				onBytes?.(chunk.length);
			}

			return Buffer.concat(chunks);
		} catch (error) {
			onBytes?.(-received);
			if (signal?.aborted) throw error;
			lastError = error;
			if (attempt < ATTEMPTS - 1) await sleep(BACKOFF_MS[attempt]);
		}
	}

	throw lastError;
}

/** Ordering gate: a segment waits here until every earlier one has been written. */
function writeQueue(startIndex) {
	let nextToWrite = startIndex;
	const waiting = new Map();

	return {
		wait(index) {
			if (index === nextToWrite) return Promise.resolve();
			return new Promise((resolve) => waiting.set(index, resolve));
		},
		advance() {
			nextToWrite += 1;
			const next = waiting.get(nextToWrite);
			if (next) {
				waiting.delete(nextToWrite);
				next();
			}
		},
	};
}

function write(stream, buffer) {
	return new Promise((resolve, reject) => {
		stream.write(buffer, (error) => (error ? reject(error) : resolve()));
	});
}

function closeStream(stream) {
	return new Promise((resolve) => stream.end(resolve));
}

/**
 * Work out where to carry on from, given whatever is already on disk.
 *
 * The state file is written after the data it describes, so it can only ever
 * name a position at or behind the end of the partial file — never ahead of it.
 * Truncating to the recorded size therefore turns "somewhere in the middle of a
 * segment" into a clean boundary.
 */
async function resumePoint(target, stateFile, signature) {
	let state;
	try {
		state = JSON.parse(await readFile(stateFile, 'utf8'));
	} catch {
		return null;
	}

	if (state?.version !== STATE_VERSION || state.signature !== signature) return null;

	let size;
	try {
		({ size } = await stat(target));
	} catch {
		return null;
	}

	if (size < state.bytes) return null;
	if (size > state.bytes) await truncate(target, state.bytes);

	return { completed: state.completed, bytes: state.bytes, seconds: state.seconds };
}

/**
 * Fetch `segments` into `target`, in order.
 *
 * Resolves `{ bytes, seconds, completed, interrupted }`. On an interruption the
 * partial file and its state are left in place deliberately — that is what a
 * later run resumes from.
 */
export async function downloadSegments({
	segments,
	target,
	concurrency = DEFAULT_CONCURRENCY,
	totalSeconds = null,
	resume = true,
	onProgress,
	signal,
}) {
	if (segments.length === 0) throw new UserFacingError('There are no segments to download.');

	const stateFile = `${target}.state`;
	const signature = signatureOf(segments, totalSeconds ?? segments.reduce((total, s) => total + s.seconds, 0));
	const wantedSeconds = segments.reduce((total, segment) => total + segment.seconds, 0);

	const resumed = resume ? await resumePoint(target, stateFile, signature) : null;
	if (!resumed) await rm(target, { force: true });

	const startIndex = resumed?.completed ?? 0;
	let bytes = resumed?.bytes ?? 0;
	let seconds = resumed?.seconds ?? 0;
	let completed = startIndex;

	if (startIndex >= segments.length) {
		return { bytes, seconds, completed, interrupted: false, resumedFrom: startIndex };
	}

	const stream = createWriteStream(target, { flags: resumed ? 'a' : 'w' });
	const queue = writeQueue(startIndex);
	const started = Date.now();
	const resumedSeconds = seconds;
	let next = startIndex;
	let lastStateAt = 0;
	let failure = null;
	// What has arrived over the network, which runs ahead of what has been
	// written: several segments are in flight at once. The progress display wants
	// this one — it is what the connection is actually doing.
	let received = bytes;

	const report = () => {
		const elapsed = Math.max((Date.now() - started) / 1000, 0.001);
		onProgress?.({
			seconds,
			bytes: received,
			// Multiple of realtime, matching what ffmpeg reported, so the display and
			// the --progress json contract stay exactly as they were.
			speed: (seconds - resumedSeconds) / elapsed,
			ratio: wantedSeconds ? Math.min(seconds / wantedSeconds, 1) : null,
		});
	};

	const saveState = async () => {
		await writeFile(stateFile, JSON.stringify({ version: STATE_VERSION, signature, completed, bytes, seconds }));
	};

	const worker = async () => {
		while (next < segments.length && !failure && !signal?.aborted) {
			const index = next;
			next += 1;
			const segment = segments[index];

			let buffer;
			try {
				buffer = await fetchSegment(segment.url, signal, (delta) => {
					received += delta;
					if (delta > 0) report();
				});
			} catch (error) {
				if (!signal?.aborted) {
					failure ??= new UserFacingError(
						`Could not fetch part ${index + 1} of ${segments.length}: ${error.message}`,
						'The download can be resumed — run the same command again.'
					);
				}
				// Let the ordering gate through, or every later segment waits forever.
				await queue.wait(index);
				queue.advance();
				return;
			}

			await queue.wait(index);
			if (failure || signal?.aborted) {
				queue.advance();
				return;
			}

			await write(stream, buffer);
			bytes += buffer.length;
			seconds += segment.seconds;
			completed = index + 1;
			queue.advance();

			// Reported before the await below: the counters are shared, and reading
			// them after a suspension lets two segments describe the same position —
			// a progress bar that stalls and then jumps.
			report();

			const now = Date.now();
			if (now - lastStateAt > STATE_INTERVAL_MS) {
				lastStateAt = now;
				await saveState();
			}
		}
	};

	await Promise.all(Array.from({ length: Math.min(concurrency, segments.length) }, worker));
	await closeStream(stream);

	const interrupted = Boolean(signal?.aborted) || Boolean(failure);
	await saveState();

	if (failure) throw failure;
	if (!interrupted) await rm(stateFile, { force: true });

	return { bytes, seconds, completed, interrupted, resumedFrom: startIndex };
}

/** Remove a partial download and its state — used once the remux has succeeded. */
export async function discardPartial(target) {
	await Promise.all([rm(target, { force: true }), rm(`${target}.state`, { force: true })]);
}
