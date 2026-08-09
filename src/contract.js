/**
 * The machine-readable output, which is public API rather than formatting.
 *
 * Fields are listed one by one on purpose. Spreading a provider's own object
 * is how the shape used to be produced, and it meant the contract was whatever
 * Kick happened to return — a second provider would have widened or renamed
 * fields without anyone deciding to. Building it explicitly means a provider
 * can only fill in this shape, never change it.
 */

/** Bumped when a field is removed or its meaning changes. Adding one is not a bump. */
export const SCHEMA_VERSION = 1;

/**
 * The fields every item has, whatever site it came from and whether it is a
 * whole broadcast or a clip.
 */
function describe(media, provider) {
	return {
		schemaVersion: SCHEMA_VERSION,
		provider: provider.key,
		kind: media.kind,
		id: media.id,
		channel: media.channel,
		title: media.title,
		startTime: media.startTime,
		durationSec: media.durationSec,
		views: media.views,
		category: media.category,
		webUrl: provider.webUrl(media),
	};
}

/** One item plus how to fetch it — what `--json` prints. */
export function mediaToJson(media, provider, { selectedQuality, sourceUrl, availableQualities } = {}) {
	return {
		...describe(media, provider),
		selectedQuality: selectedQuality ?? null,
		sourceUrl: sourceUrl ?? null,
		availableQualities: availableQualities ?? [],
	};
}

/**
 * A channel listing — what `--list --json` prints. The stream URL is left out
 * deliberately: producing one means fetching every playlist, and a listing has
 * to stay cheap enough to poll.
 */
export function listingToJson(items, provider) {
	return items.map((item) => describe(item, provider));
}
