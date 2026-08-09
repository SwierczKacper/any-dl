import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

import { HELP_TEXT, parseArgs } from './args.js';
import { listingToJson, mediaToJson } from './contract.js';
import { download } from './ffmpeg.js';
import { describeVariant, estimateBytes, getVariants, selectVariant } from './hls.js';
import { confirm, input, isInteractive, select } from './prompt.js';
import { resolveProvider } from './providers/index.js';
import {
	c,
	formatBytes,
	formatDate,
	formatDuration,
	formatProgress,
	info,
	success,
	warn,
} from './ui.js';
import {
	freeSpaceBytes,
	normalizeTitle,
	parseTimecode,
	resolveOutputDir,
	sanitizeFilename,
	uniquePath,
	UserFacingError,
} from './util.js';

// Below this, ffmpeg wrote a container header and nothing else.
const MINIMUM_USEFUL_SECONDS = 0.1;

function readVersion() {
	try {
		const here = dirname(fileURLToPath(import.meta.url));
		return JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).version;
	} catch {
		return 'unknown';
	}
}

/**
 * "<channel> - <date> - <title>.mp4".
 *
 * The quality is deliberately left out: it is readable from the file itself, and
 * downloading the same VOD twice at different qualities is rare enough that
 * uniquePath's " (2)" suffix covers it. Exported for testing.
 */
export function buildFilename(media) {
	const date = media.startTime ? formatDate(media.startTime).slice(0, 10) : '';
	const fields = [media.channel, date, normalizeTitle(media.title)].filter(Boolean);
	return `${sanitizeFilename(fields.join(' - '))}.mp4`;
}

/**
 * Quality list for the picker: name, resolution, bitrate and — the point of the
 * exercise — roughly what the file will weigh. Variants arrive best-first, so
 * the first entry is both the recommendation and the initial selection.
 */
export function qualityChoices(variants, seconds, freeBytes = null) {
	const nameWidth = Math.max(...variants.map((variant) => variant.name.length));
	const resolutionWidth = Math.max(
		...variants.map((variant) => (variant.width && variant.height ? `${variant.width}x${variant.height}`.length : 7))
	);

	return variants.map((variant, index) => {
		const resolution = variant.width && variant.height ? `${variant.width}x${variant.height}` : 'unknown';
		const mbps = variant.bandwidth ? `${(variant.bandwidth / 1_000_000).toFixed(2)} Mbps` : '';
		const bytes = estimateBytes(variant, seconds);
		const size = bytes ? `~${formatBytes(bytes)}` : '';

		const columns = [
			variant.name.padEnd(nameWidth),
			resolution.padEnd(resolutionWidth),
			mbps.padStart(9),
			size.padStart(10),
		];

		// Flagging this in the list is the whole point — better than finding out
		// when the disk fills up an hour into a download.
		if (bytes != null && freeBytes != null && bytes > freeBytes) columns.push(' — not enough space');
		else if (index === 0) columns.push(' (recommended)');

		return { name: columns.join('  '), value: variant };
	});
}

function describeMedia(media) {
	const parts = [formatDate(media.startTime)];
	if (media.durationSec) parts.push(formatDuration(media.durationSec));
	if (media.category) parts.push(media.category);
	if (media.views) parts.push(`${media.views.toLocaleString('en-US')} views`);
	return parts.join(' · ');
}

function toChoices(items) {
	return items.map((item) => ({
		name: `${item.title}  ${c.gray(`(${item.durationSec ? formatDuration(item.durationSec) : '?'})`)}`,
		description: describeMedia(item),
		value: item,
	}));
}

/** Returned by the picker when the user asked for the other list instead. */
const SWITCH_KIND = Symbol('switch kind');

/** Resolve the CLI target into a single VOD/clip, prompting when needed. */
async function resolveMedia(target, provider, options) {
	if (target.type === 'video') return provider.getVideo(target.id, { channel: target.channel });
	if (target.type === 'clip') return provider.getClip(target.id);

	// The picker can swap between a channel's VODs and its clips, which means
	// fetching the other list rather than making the user rerun the command.
	let clips = options.clips;

	for (;;) {
		const label = clips ? 'clips' : 'VODs';
		info(`Fetching ${label} for ${c.bold(target.channel)}…`);

		const items = clips
			? await provider.getChannelClips(target.channel, { limit: options.limit })
			: await provider.getChannelVods(target.channel, { limit: options.limit });

		if (items.length === 0) {
			// Only a fresh run has nothing to fall back to. Having switched, the
			// list we came from is known to have had something in it.
			if (clips === options.clips) {
				throw new UserFacingError(`No ${label} found for channel "${target.channel}".`);
			}
			warn(`This channel has no ${label}.`);
			clips = !clips;
			continue;
		}

		if (options.list) {
			if (options.json) {
				// Same shape as a single --json result, minus the stream URL, which
				// would mean fetching every playlist just to list them.
				process.stdout.write(`${JSON.stringify(listingToJson(items, provider), null, 2)}\n`);
				return null;
			}

			for (const [index, item] of items.entries()) {
				process.stdout.write(
					`${String(index + 1).padStart(2)}. ${item.title}\n    ${describeMedia(item)}\n    ${provider.webUrl(item)}\n`
				);
			}
			return null;
		}

		if (!isInteractive()) {
			throw new UserFacingError(
				'A channel name needs an interactive terminal to pick from.',
				'Pass a direct VOD link instead, or use --list to see what is available.'
			);
		}

		const chosen = await select({
			message: `Select a ${clips ? 'clip' : 'VOD'}`,
			choices: toChoices(items),
			actions: [{ key: 'c', hint: clips ? 'c VODs' : 'c clips', value: SWITCH_KIND }],
		});

		if (chosen !== SWITCH_KIND) return chosen;
		clips = !clips;
	}
}

/**
 * Ask which site a bare channel name belongs to. Only ever reached when more
 * than one site is supported and nothing else has settled the question.
 */
function chooseSite(providers) {
	return select({
		message: 'Which site?',
		choices: providers.map((provider) => ({ name: provider.label, value: provider })),
	});
}

/** Validated up front, before any network work, so typos fail instantly. */
function parseTimeRange(options) {
	const from = options.from == null ? null : parseTimecode(options.from);
	const to = options.to == null ? null : parseTimecode(options.to);

	if (options.from != null && from == null) throw new UserFacingError(`--from is not a valid timecode: ${options.from}`);
	if (options.to != null && to == null) throw new UserFacingError(`--to is not a valid timecode: ${options.to}`);
	if (from != null && to != null && to <= from) throw new UserFacingError('--to must be later than --from.');

	return { from, to };
}

/**
 * Progress display. Returns the callback ffmpeg drives plus a done() that
 * leaves the terminal tidy.
 *
 * The download rate is measured here rather than taken from ffmpeg, which only
 * reports a multiple of realtime — true, but not what someone watching a
 * multi-gigabyte transfer wants to know. It is smoothed, because raw deltas
 * between 200 ms repaints jump around too much to read.
 */
function makeProgressReporter({ mode, totalSeconds, estimatedBytes }) {
	if (mode === 'none') {
		return { onProgress: undefined, done: () => {} };
	}

	// NDJSON on stdout: one object per line, for a caller that is a program.
	// stdout is unused during a download, so it stays free of anything else.
	if (mode === 'json') {
		let lastEmit = 0;
		return {
			onProgress: (stats) => {
				const now = Date.now();
				if (now - lastEmit < 500) return;
				lastEmit = now;

				process.stdout.write(
					`${JSON.stringify({
						event: 'progress',
						seconds: Number(stats.seconds.toFixed(3)),
						totalSeconds: totalSeconds || null,
						bytes: stats.bytes,
						estimatedBytes: estimatedBytes ? Math.round(estimatedBytes) : null,
						ratio: stats.ratio == null ? null : Number(stats.ratio.toFixed(5)),
						speed: stats.speed,
					})}\n`
				);
			},
			done: () => {},
		};
	}

	if (!process.stderr.isTTY) {
		let lastLogged = 0;
		return {
			onProgress: (stats) => {
				// Non-TTY: one line every 30s of media so logs stay readable.
				if (stats.seconds - lastLogged < 30) return;
				lastLogged = stats.seconds;
				// Not a terminal: piped, redirected or under cron. Nobody is reading
				// this live, so the technical detail is worth keeping here even
				// though it was dropped from the interactive display.
				info(
					`${formatDuration(stats.seconds)} · ${formatBytes(stats.bytes)} · ${stats.speed.toFixed(1)}x realtime`
				);
			},
			done: () => {},
		};
	}

	const out = process.stderr;
	let lastPaint = 0;
	let lastBytes = 0;
	let lastSampleAt = Date.now();
	let rate = 0;
	let painted = 0;

	const clear = () => {
		if (painted === 0) return;
		readline.moveCursor(out, 0, -(painted - 1));
		readline.cursorTo(out, 0);
		readline.clearScreenDown(out);
		painted = 0;
	};

	return {
		onProgress: (stats) => {
			const now = Date.now();
			if (now - lastPaint < 200) return;

			const elapsed = (now - lastSampleAt) / 1000;
			if (elapsed > 0 && stats.bytes >= lastBytes) {
				const sample = (stats.bytes - lastBytes) / elapsed;
				// Exponential smoothing: responsive to real changes, not to jitter.
				rate = rate === 0 ? sample : rate * 0.7 + sample * 0.3;
			}
			lastBytes = stats.bytes;
			lastSampleAt = now;
			lastPaint = now;

			// Once underway, extrapolating from what has actually arrived beats the
			// playlist's advertised bitrate, which is a peak figure.
			const projected = stats.ratio > 0.02 && stats.bytes > 0 ? stats.bytes / stats.ratio : estimatedBytes;

			const lines = formatProgress({
				ratio: stats.ratio,
				seconds: stats.seconds,
				totalSeconds,
				bytes: stats.bytes,
				totalBytes: projected,
				rate,
				speed: stats.speed,
				width: out.columns || 80,
			});

			clear();
			out.write(lines.join('\n'));
			painted = lines.length;
		},
		done: clear,
	};
}

export async function run(argv) {
	const options = parseArgs(argv);

	if (options.help) {
		process.stdout.write(`${HELP_TEXT}\n`);
		return 0;
	}
	if (options.version) {
		process.stdout.write(`${readVersion()}\n`);
		return 0;
	}

	let targetInput = options.target;
	if (!targetInput) {
		if (!isInteractive()) {
			process.stdout.write(`${HELP_TEXT}\n`);
			return 1;
		}
		// One prompt, taking either form. A pasted link settles which site this
		// is, so asking that first would be a question most people never need.
		targetInput = await input({ message: 'Paste a link, or type a channel name' });
		if (!targetInput) return 130;
	}

	const provider = await resolveProvider({
		target: targetInput,
		provider: options.provider,
		env: process.env.ANY_DL_PROVIDER,
		// --yes means "ask me nothing", and there is no sensible default site to
		// fall back on, so an ambiguous name fails there exactly as it does with
		// no terminal at all. Picking one for the user would be the guess this
		// whole path exists to avoid.
		chooseSite: isInteractive() && !options.yes ? chooseSite : null,
	});
	if (provider === null) return 130; // the site picker was cancelled

	const target = provider.parseTarget(targetInput);
	const { from, to } = parseTimeRange(options);

	const chosen = await resolveMedia(target, provider, options);

	if (chosen === null) return 0; // --list, or the picker was cancelled

	// A listing entry may not carry a stream URL: on some sites getting one means
	// a signed request per entry, which is too much work to draw a menu. Filling
	// it in here means only the item actually picked is paid for.
	const media = provider.resolvePlayable ? await provider.resolvePlayable(chosen) : chosen;

	// Clips are plain MP4s; VODs go through an HLS master playlist.
	const variants = media.masterUrl ? await getVariants(media.masterUrl) : [];

	if (options.qualities) {
		if (variants.length === 0) {
			process.stdout.write('This is a clip — only the original quality is available.\n');
		} else {
			const seconds = (parseTimecode(options.to) ?? media.durationSec ?? 0) - (parseTimecode(options.from) ?? 0);
			for (const choice of qualityChoices(variants, seconds)) process.stdout.write(`${choice.name}\n`);
		}
		return 0;
	}

	if (options.json) {
		const chosen = variants.length > 0 ? selectVariant(variants, options.quality ?? 'best') : null;
		process.stdout.write(
			`${JSON.stringify(
				mediaToJson(media, provider, {
					selectedQuality: chosen?.name ?? 'original',
					sourceUrl: chosen ? chosen.url : media.directUrl,
					availableQualities: variants.map((v) => v.name),
				}),
				null,
				2
			)}\n`
		);
		return 0;
	}

	if (media.durationSec && from != null && from >= media.durationSec) {
		throw new UserFacingError(
			`--from (${formatDuration(from)}) is past the end of the video (${formatDuration(media.durationSec)}).`
		);
	}

	const outputDir = resolveOutputDir({
		dir: options.dir,
		envDir: process.env.ANY_DL_DIR,
		channel: media.channel,
		perChannel: options.channelDir,
	});
	mkdirSync(outputDir, { recursive: true });

	const requestedName = options.output
		? options.output.toLowerCase().endsWith('.mp4')
			? options.output
			: `${options.output}.mp4`
		: buildFilename(media);
	const outputPath = uniquePath(outputDir, requestedName);

	process.stderr.write('\n');
	info(`${c.bold(media.title)}`);
	info(`${describeMedia(media)}`);
	if (from != null || to != null) {
		info(`Range:   ${formatDuration(from ?? 0)} → ${to != null ? formatDuration(to) : 'end'}`);
	}
	info(`File:    ${outputPath}`);
	process.stderr.write('\n');

	// How much video is actually being fetched — what the size estimates describe.
	const sliceSeconds = (to ?? media.durationSec ?? 0) - (from ?? 0);
	const freeBytes = freeSpaceBytes(outputDir);

	let variant = null;
	let pickedFromList = false;

	if (variants.length === 0) {
		// A clip: one quality, nothing to choose.
	} else if (options.quality != null) {
		variant = selectVariant(variants, options.quality);
	} else if (options.yes || !isInteractive()) {
		variant = selectVariant(variants, 'best');
	} else {
		variant = await select({
			message: freeBytes != null ? `Select quality (${formatBytes(freeBytes)} free)` : 'Select quality',
			choices: qualityChoices(variants, sliceSeconds, freeBytes),
			pageSize: 8,
		});
		if (!variant) {
			warn('Cancelled.');
			return 130;
		}
		pickedFromList = true;
	}

	const sourceUrl = variant ? variant.url : media.directUrl;
	if (!sourceUrl) throw new UserFacingError('No downloadable stream URL found for this item.');

	info(`Quality: ${c.bold(variant ? describeVariant(variant) : 'original (clip)')}`);

	// Catches the case the picker cannot: an explicit --quality, or a clip whose
	// size was never estimated.
	const estimate = estimateBytes(variant, sliceSeconds);
	const tooBig = estimate != null && freeBytes != null && estimate > freeBytes;

	if (tooBig) {
		warn(
			`This needs about ${formatBytes(estimate)} but only ${formatBytes(freeBytes)} is free on ${outputDir}.`
		);

		if (options.yes || !isInteractive()) {
			throw new UserFacingError(
				'Not enough free disk space.',
				'Free some space, pick a lower quality with --quality, or shorten the range with --from/--to.'
			);
		}

		const proceed = await confirm({ message: 'Try anyway?', defaultValue: false });
		if (!proceed) {
			warn('Cancelled.');
			return 130;
		}
	} else if (!options.yes && !pickedFromList) {
		// Choosing from the list already was the confirmation.
		const proceed = await confirm({ message: 'Start download?', defaultValue: true });
		if (!proceed) {
			warn('Cancelled.');
			return 130;
		}
	}

	const reporter = makeProgressReporter({
		mode: options.progress,
		totalSeconds: sliceSeconds > 0 ? sliceSeconds : null,
		estimatedBytes: estimate,
	});

	const result = await download({
		url: sourceUrl,
		output: outputPath,
		durationSec: media.durationSec,
		from,
		to,
		faststart: options.faststart,
		onProgress: reporter.onProgress,
	});

	reporter.done();

	let size = 0;
	try {
		size = statSync(outputPath).size;
	} catch {
		// Nothing written — the error path below covers it.
	}

	// ffmpeg exits 0 even when it wrote no frames, which happens when a --from/--to
	// range is shorter than the gap to the next keyframe. Don't call that a success.
	if (!result.interrupted && result.seconds < MINIMUM_USEFUL_SECONDS) {
		rmSync(outputPath, { force: true });
		throw new UserFacingError(
			'ffmpeg produced an empty file — nothing was downloaded.',
			from != null || to != null
				? 'The requested range is probably shorter than the distance to the next keyframe. Widen it (10 seconds or more) and try again.'
				: `The stream may have been pruned by ${provider.label}. Retry, or try a different quality.`
		);
	}

	if (result.interrupted) {
		warn(`Stopped early. Partial file kept: ${outputPath} (${formatBytes(size)})`);
		return 130;
	}

	success(`Saved ${c.bold(outputPath)} (${formatBytes(size)})`);
	return 0;
}
