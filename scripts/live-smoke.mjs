/**
 * End-to-end check against the real sites.
 *
 * Everything in test/ is offline, which means a change on a site's side — an API
 * move, a Cloudflare policy change, a new id scheme — would go unnoticed until a
 * user hit it. This exercises the whole path once per site: read the API,
 * resolve a VOD, parse its playlist, and copy a few seconds with ffmpeg.
 *
 * Deliberately small: it takes ~12 seconds of the *lowest* quality (a few
 * hundred KB), from whichever channel answers first, and deletes it immediately.
 * Not wired into pull requests — see .github/workflows/live-smoke.yml.
 *
 * Every site is attempted even after one fails, because "Twitch is fine, Kick
 * is not" is the useful answer and stopping at the first failure hides it.
 *
 * Run locally with:  npm run smoke
 */
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { download } from '../src/ffmpeg.js';
import { getVariants, selectVariant } from '../src/hls.js';
import * as kick from '../src/providers/kick.js';
import * as twitch from '../src/providers/twitch.js';
import { formatBytes, formatDuration } from '../src/ui.js';

// VODs get pruned, so no fixed id can be relied on. These are simply large,
// long-running channels likely to have something recent; the first one that
// answers wins. Swap them freely — nothing depends on any particular channel.
const SITES = [
	{ provider: kick, channels: ['xqc', 'trainwreckstv', 'adinross', 'roshtein', 'xmerghani'] },
	{ provider: twitch, channels: ['xqc', 'kaicenat', 'jynxzi', 'ibai', 'ewroon'] },
];

const SLICE_START = 60;
const SLICE_SECONDS = 12;
// Needs enough runway that the slice sits comfortably inside the stream.
const MINIMUM_VOD_SECONDS = 300;

function log(message) {
	process.stdout.write(`${message}\n`);
}

async function findUsableVod({ provider, channels }) {
	for (const channel of channels) {
		try {
			log(`· checking ${channel}…`);
			const vods = await provider.getChannelVods(channel, { limit: 5 });
			const candidate = vods.find((vod) => (vod.durationSec ?? 0) > MINIMUM_VOD_SECONDS);
			if (!candidate) {
				log(`  no VOD long enough on ${channel}`);
				continue;
			}

			// A listing entry may carry no stream URL — that is the point of the
			// hook, and exercising it here is exactly what this check is for.
			const usable = provider.resolvePlayable ? await provider.resolvePlayable(candidate) : candidate;
			if (usable.masterUrl) return usable;

			log(`  ${channel}: no playable source`);
		} catch (error) {
			// One dead channel must not fail the run — that is what the list is for.
			log(`  ${channel} unavailable: ${error.message}`);
		}
	}
	return null;
}

async function checkSite(site) {
	log(`\n── ${site.provider.label} ──`);

	const vod = await findUsableVod(site);
	if (!vod) {
		throw new Error(`None of the channels returned a usable VOD: ${site.channels.join(', ')}`);
	}

	log(`✓ API reachable — ${vod.channel}: "${vod.title}" (${formatDuration(vod.durationSec)})`);

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
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

log('Live smoke test');

const failures = [];

for (const site of SITES) {
	try {
		await checkSite(site);
	} catch (error) {
		failures.push({ label: site.provider.label, error });
		log(`✗ ${site.provider.label}: ${error.message}`);
		if (error.hint) log(`  ${error.hint}`);
	}
}

if (failures.length > 0) {
	process.stderr.write(`\n✗ Live smoke test failed for: ${failures.map((f) => f.label).join(', ')}\n`);
	process.exitCode = 1;
} else {
	log('\nAll good — the full path still works on every site.');
}
