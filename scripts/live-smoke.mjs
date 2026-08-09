/**
 * End-to-end check against the real Kick API.
 *
 * Everything in test/ is offline, which means a change on Kick's side — an API
 * move, a Cloudflare policy change, a new id scheme — would go unnoticed until a
 * user hit it. This exercises the whole path once: read the API through Chrome,
 * resolve a VOD, parse its playlist, and copy a few seconds with ffmpeg.
 *
 * Deliberately small: it takes ~12 seconds of the *lowest* quality (a few
 * hundred KB), from whichever channel answers first, and deletes it immediately.
 * Not wired into pull requests — see .github/workflows/live-smoke.yml.
 *
 * Run locally with:  npm run smoke
 */
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { download } from '../src/ffmpeg.js';
import { getVariants, selectVariant } from '../src/hls.js';
import * as kick from '../src/kick.js';
import { formatBytes, formatDuration } from '../src/ui.js';

// Kick prunes VODs, so no fixed id can be relied on. These are simply large,
// long-running channels likely to have something recent; the first one that
// answers wins. Swap them freely — nothing depends on any particular channel.
const CHANNELS = ['xqc', 'trainwreckstv', 'adinross', 'roshtein', 'xmerghani'];

const SLICE_START = 60;
const SLICE_SECONDS = 12;
// Needs enough runway that the slice sits comfortably inside the stream.
const MINIMUM_VOD_SECONDS = 300;

function log(message) {
	process.stdout.write(`${message}\n`);
}

async function findUsableVod() {
	for (const channel of CHANNELS) {
		try {
			log(`· checking ${channel}…`);
			const vods = await kick.getChannelVods(channel, { limit: 5 });
			const usable = vods.find((vod) => vod.masterUrl && (vod.durationSec ?? 0) > MINIMUM_VOD_SECONDS);

			if (usable) return usable;
			log(`  no VOD long enough on ${channel}`);
		} catch (error) {
			// One dead channel must not fail the run — that is what the list is for.
			log(`  ${channel} unavailable: ${error.message}`);
		}
	}
	return null;
}

async function main() {
	log('Live smoke test against kick.com\n');

	const vod = await findUsableVod();
	if (!vod) {
		throw new Error(`None of the channels returned a usable VOD: ${CHANNELS.join(', ')}`);
	}

	log(`\n✓ API reachable — ${vod.channel}: "${vod.title}" (${formatDuration(vod.durationSec)})`);

	const variants = await getVariants(vod.masterUrl);
	log(`✓ playlist parsed — ${variants.length} qualities: ${variants.map((v) => v.name).join(', ')}`);

	// Lowest quality on purpose: this is a liveness check, not a download.
	const variant = selectVariant(variants, 'worst');
	const dir = mkdtempSync(join(tmpdir(), 'any-dl-smoke-'));
	const output = join(dir, 'smoke.mp4');

	try {
		const result = await download({
			url: variant.url,
			output,
			durationSec: vod.durationSec,
			from: SLICE_START,
			to: SLICE_START + SLICE_SECONDS,
		});

		if (result.seconds < SLICE_SECONDS * 0.5) {
			throw new Error(`ffmpeg wrote only ${result.seconds.toFixed(2)}s — expected about ${SLICE_SECONDS}s`);
		}

		log(`✓ downloaded ${result.seconds.toFixed(1)}s of ${variant.name} (${formatBytes(statSync(output).size)})`);
		log('\nAll good — the full path still works.');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

try {
	await main();
} catch (error) {
	process.stderr.write(`\n✗ Live smoke test failed: ${error.message}\n`);
	if (error.hint) process.stderr.write(`  ${error.hint}\n`);
	process.exitCode = 1;
}
