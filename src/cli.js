import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HELP_TEXT, parseArgs } from './args.js';
import { download } from './ffmpeg.js';
import { describeVariant, getVariants, selectVariant } from './hls.js';
import * as kick from './kick.js';
import { confirm, input, isInteractive, select } from './prompt.js';
import {
	c,
	formatBytes,
	formatDate,
	formatDuration,
	info,
	progressBar,
	success,
	warn,
} from './ui.js';
import {
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

/** Resolve the CLI target into a single VOD/clip, prompting when needed. */
async function resolveMedia(target, options) {
	if (target.type === 'video') return kick.getVideo(target.uuid, { channel: target.channel });
	if (target.type === 'clip') return kick.getClip(target.id);

	const label = options.clips ? 'clips' : 'VODs';
	info(`Fetching ${label} for ${c.bold(target.channel)}…`);

	const items = options.clips
		? await kick.getChannelClips(target.channel, { limit: options.limit })
		: await kick.getChannelVods(target.channel, { limit: options.limit });

	if (items.length === 0) {
		throw new UserFacingError(`No ${label} found for channel "${target.channel}".`);
	}

	if (options.list) {
		for (const [index, item] of items.entries()) {
			process.stdout.write(
				`${String(index + 1).padStart(2)}. ${item.title}\n    ${describeMedia(item)}\n    https://kick.com/${item.channel}/videos/${item.uuid}\n`
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

	const chosen = await select({ message: `Select a ${options.clips ? 'clip' : 'VOD'}`, choices: toChoices(items) });
	return chosen;
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

function makeProgressReporter(enabled) {
	if (!enabled || !process.stderr.isTTY) {
		let lastLogged = 0;
		return (stats) => {
			// Non-TTY: one line every 30s of media so logs stay readable.
			if (stats.seconds - lastLogged < 30) return;
			lastLogged = stats.seconds;
			info(`${formatDuration(stats.seconds)} · ${formatBytes(stats.bytes)} · ${stats.speed.toFixed(1)}x`);
		};
	}

	let lastPaint = 0;
	return (stats) => {
		const now = Date.now();
		if (now - lastPaint < 200) return;
		lastPaint = now;

		const pieces = [];
		if (stats.ratio != null) {
			pieces.push(progressBar(stats.ratio), `${(stats.ratio * 100).toFixed(1)}%`);
		}
		pieces.push(formatDuration(stats.seconds), formatBytes(stats.bytes), `${stats.speed.toFixed(1)}x`);

		if (stats.ratio != null && stats.speed > 0) {
			const remaining = (stats.seconds / stats.ratio - stats.seconds) / stats.speed;
			pieces.push(`ETA ${formatDuration(remaining)}`);
		}

		process.stderr.write(`\r\x1b[K  ${pieces.join('  ')}`);
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
		targetInput = await input({ message: 'Kick VOD link or channel name' });
		if (!targetInput) return 130;
	}

	const target = kick.parseTarget(targetInput);
	const { from, to } = parseTimeRange(options);

	const media = await resolveMedia(target, options);

	if (media === null) return 0; // --list, or the picker was cancelled

	// Clips are plain MP4s; VODs go through an HLS master playlist.
	const variants = media.masterUrl ? await getVariants(media.masterUrl) : [];

	if (options.qualities) {
		if (variants.length === 0) {
			process.stdout.write('This is a clip — only the original quality is available.\n');
		} else {
			for (const variant of variants) process.stdout.write(`${describeVariant(variant)}\n`);
		}
		return 0;
	}

	const variant = variants.length > 0 ? selectVariant(variants, options.quality) : null;
	const sourceUrl = variant ? variant.url : media.directUrl;

	if (!sourceUrl) throw new UserFacingError('No downloadable stream URL found for this item.');

	if (options.json) {
		process.stdout.write(
			`${JSON.stringify(
				{
					...media,
					selectedQuality: variant?.name ?? 'original',
					sourceUrl,
					availableQualities: variants.map((v) => v.name),
				},
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
		envDir: process.env.KICK_VOD_DIR,
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
	info(`Quality: ${c.bold(variant ? describeVariant(variant) : 'original (clip)')}`);
	if (from != null || to != null) {
		info(`Range:   ${formatDuration(from ?? 0)} → ${to != null ? formatDuration(to) : 'end'}`);
	}
	info(`File:    ${outputPath}`);
	process.stderr.write('\n');

	if (!options.yes) {
		const proceed = await confirm({ message: 'Start download?', defaultValue: true });
		if (!proceed) {
			warn('Cancelled.');
			return 130;
		}
	}

	const result = await download({
		url: sourceUrl,
		output: outputPath,
		durationSec: media.durationSec,
		from,
		to,
		faststart: options.faststart,
		onProgress: makeProgressReporter(options.progress),
	});

	if (process.stderr.isTTY && options.progress) process.stderr.write('\r\x1b[K');

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
				: 'The stream may have been pruned by Kick. Retry, or try a different quality.'
		);
	}

	if (result.interrupted) {
		warn(`Stopped early. Partial file kept: ${outputPath} (${formatBytes(size)})`);
		return 130;
	}

	success(`Saved ${c.bold(outputPath)} (${formatBytes(size)})`);
	return 0;
}
