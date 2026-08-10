import { postJson } from '../http.js';
import { UserFacingError } from '../util.js';

/**
 * Twitch, read through the same GraphQL API its own web player uses.
 *
 * Unlike Kick there is no Cloudflare to get past, so this needs no browser —
 * an ordinary request with the player's public client id is enough.
 *
 * The queries below are written out in full rather than sent as persisted
 * queries (an operation name plus a hash of a query Twitch already knows).
 * Hashes are what most tools use and they are the usual reason those tools
 * break: Twitch rotates them whenever the schema moves, and every client
 * pinned to the old hash starts getting "PersistedQueryNotFound" on the same
 * afternoon. Sending the query itself costs one larger request and keeps
 * working across those changes.
 */

const GQL_ENDPOINT = 'https://gql.twitch.tv/gql';

// The web player's own client id. It is not a secret and not tied to an
// account: it ships in the page and every browser opening twitch.tv sends it.
const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

const USHER_VOD = 'https://usher.ttvnw.net/vod';

// Twitch logins are letters, digits and underscores, and cannot be long. A clip
// slug is built from words and may carry a suffix after a hyphen, so anything
// longer than a login could be, or containing a hyphen, is not a channel.
const LOGIN = /^[A-Za-z0-9_]{1,25}$/;

// Twitch's own pages live at the same level as channels, so they read as
// perfectly good logins. Not exhaustive — it does not need to be, since an
// unknown login fails clearly anyway — just the ones somebody might paste.
const RESERVED_PATHS = new Set(['directory', 'settings', 'subscriptions', 'downloads', 'drops', 'wallet', 'store', 'popout', 'moderator', 'videos']);

export const key = 'twitch';
export const label = 'Twitch';

export function matchUrl(url) {
	return /(^|\.)twitch\.tv$/i.test(url.hostname);
}

export function webUrl(media) {
	if (media.kind === 'clip') return `https://www.twitch.tv/${media.channel}/clip/${media.id}`;
	return `https://www.twitch.tv/videos/${media.id}`;
}

/** Video ids appear both bare and prefixed, as in player links: v2832871456. */
function normalizeVideoId(raw) {
	const id = String(raw).replace(/^v(?=\d)/i, '');
	return /^\d+$/.test(id) ? id : null;
}

export function parseTarget(input) {
	const raw = String(input ?? '').trim();
	if (!raw) throw new UserFacingError('No channel or link given.');

	if (/^https?:\/\//i.test(raw)) return parseUrl(raw);

	const videoId = normalizeVideoId(raw);
	if (videoId) return { type: 'video', id: videoId };

	const channel = raw.replace(/^@/, '');
	if (LOGIN.test(channel)) return { type: 'channel', channel: channel.toLowerCase() };

	// Too long or too punctuated to be a login. A clip slug is the only other
	// bare form Twitch has, and it looks exactly like this.
	if (/^[A-Za-z0-9_-]+$/.test(channel)) return { type: 'clip', id: channel };

	throw new UserFacingError(`"${raw}" is neither a valid Twitch link nor a channel name.`);
}

function parseUrl(rawUrl) {
	let url;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new UserFacingError(`Not a valid URL: ${rawUrl}`);
	}

	if (!matchUrl(url)) throw new UserFacingError(`Not a twitch.tv link: ${rawUrl}`);

	const segments = url.pathname.split('/').filter(Boolean);

	// https://clips.twitch.tv/<slug>  |  .../embed?clip=<slug>
	const clipQuery = url.searchParams.get('clip');
	if (clipQuery) return { type: 'clip', id: clipQuery };

	// https://player.twitch.tv/?video=v123456789
	const videoQuery = url.searchParams.get('video');
	if (videoQuery) {
		const id = normalizeVideoId(videoQuery);
		if (id) return { type: 'video', id };
	}

	if (/^clips\./i.test(url.hostname)) {
		const slug = segments.at(-1);
		if (slug && slug !== 'embed') return { type: 'clip', id: slug };
	}

	// https://www.twitch.tv/<channel>/clip/<slug>
	const clipIndex = segments.indexOf('clip');
	if (clipIndex !== -1 && segments[clipIndex + 1]) {
		return { type: 'clip', id: segments[clipIndex + 1], channel: segments[0] };
	}

	// https://www.twitch.tv/videos/<id>  |  https://www.twitch.tv/<channel>/v/<id>
	const videoIndex = segments.findIndex((segment) => segment === 'videos' || segment === 'video' || segment === 'v');
	if (videoIndex !== -1 && segments[videoIndex + 1]) {
		const id = normalizeVideoId(segments[videoIndex + 1]);
		// "/<channel>/videos" is the channel's video tab, not a video.
		if (id) return { type: 'video', id };
	}

	// https://www.twitch.tv/<channel>, and its tabs: /videos, /clips, /about…
	// A channel link is a login and at most one tab; anything deeper is one of
	// Twitch's own pages, which happen to sit at the same level as channels.
	if (segments.length <= 2 && segments[0] && LOGIN.test(segments[0]) && !RESERVED_PATHS.has(segments[0].toLowerCase())) {
		return { type: 'channel', channel: segments[0].toLowerCase() };
	}

	throw new UserFacingError(`Could not tell what this link points at: ${rawUrl}`);
}

async function gql(query, variables) {
	const body = await postJson(
		GQL_ENDPOINT,
		{ query, variables },
		{ headers: { 'Client-ID': CLIENT_ID } }
	);

	const failure = body?.errors?.[0]?.message;
	if (failure) throw new UserFacingError(`Twitch rejected the request: ${failure}`);

	return body?.data ?? {};
}

const MEDIA_FIELDS = `id title lengthSeconds publishedAt viewCount owner { login } game { name }`;

const TOKEN_PARAMS = `params: { platform: "web", playerBackend: "mediaplayer", playerType: "site" }`;

function normalizeVod(video, channelFallback) {
	return {
		kind: 'vod',
		id: video.id,
		title: video.title?.trim() || 'Untitled stream',
		channel: video.owner?.login || channelFallback || 'twitch',
		startTime: video.publishedAt || null,
		durationSec: Number(video.lengthSeconds) || null,
		views: Number(video.viewCount) || 0,
		category: video.game?.name || null,
		masterUrl: null,
	};
}

/**
 * Turn a playback token into the master playlist URL.
 *
 * The token is a JSON document that says what the bearer may watch, and the
 * signature proves Twitch issued it; usher checks the pair and answers with the
 * playlist. Reading the document first lets a refusal be explained here, where
 * the reason is still available, rather than surfacing later as a bare 403 from
 * a CDN.
 */
function masterUrlFor(videoId, token) {
	if (!token?.value || !token?.signature) {
		throw new UserFacingError(
			`Twitch would not issue a playback token for video ${videoId}.`,
			'It may be private, deleted, or available only to subscribers.'
		);
	}

	let claims = {};
	try {
		claims = JSON.parse(token.value);
	} catch {
		// Opaque to us but still valid to usher — pass it along unread.
	}

	if (claims?.authorization?.forbidden) {
		throw new UserFacingError(
			`Twitch will not play video ${videoId}: ${claims.authorization.reason || 'access denied'}`,
			'Subscriber-only videos cannot be downloaded without an account, which this tool does not use.'
		);
	}

	const query = new URLSearchParams({
		allow_source: 'true',
		// Deliberately not allow_audio_only: it adds a soundtrack-shaped entry to
		// the quality picker that nobody scrolling for 1080p is looking for.
		platform: 'web',
		player: 'twitchweb',
		supported_codecs: 'av1,h265,h264',
		playlist_include_framerate: 'true',
		sig: token.signature,
		token: token.value,
	});

	return `${USHER_VOD}/${encodeURIComponent(videoId)}.m3u8?${query}`;
}

export async function getVideo(id) {
	const data = await gql(
		`query ($id: ID!) {
			video(id: $id) { ${MEDIA_FIELDS} }
			videoPlaybackAccessToken(id: $id, ${TOKEN_PARAMS}) { value signature }
		}`,
		{ id }
	);

	if (!data.video) {
		throw new UserFacingError(
			`Twitch has no video ${id}.`,
			'It may have been deleted, or expired — Twitch keeps VODs for a limited time.'
		);
	}

	return {
		...normalizeVod(data.video),
		masterUrl: masterUrlFor(id, data.videoPlaybackAccessToken),
	};
}

function normalizeClip(clip, channelFallback) {
	return {
		kind: 'clip',
		id: clip.slug,
		title: clip.title?.trim() || 'Untitled clip',
		channel: clip.broadcaster?.login || channelFallback || 'twitch',
		startTime: clip.createdAt || null,
		durationSec: Number(clip.durationSeconds) || null,
		views: Number(clip.viewCount) || 0,
		category: clip.game?.name || null,
		// Filled in by getClip: a listing does not pay for a token per entry.
		directUrl: null,
		masterUrl: null,
		variants: null,
	};
}

/**
 * A clip's sizes, in the shape the quality picker already understands.
 *
 * Twitch gives a height as a string and sometimes a frame rate; there is no
 * width and no bitrate, so those stay null and everything downstream has to
 * cope with not knowing them. Sorted tallest first, which is the order the
 * picker and `--quality best` both assume.
 *
 * Exported so the naming and ordering can be tested without a live clip.
 */
export function clipVariants(clip) {
	const token = clip.playbackAccessToken;

	return (clip.videoQualities ?? [])
		.filter((quality) => quality?.sourceURL)
		.map((quality) => {
			const height = Number(quality.quality) || null;
			const frameRate = Math.round(Number(quality.frameRate)) || null;

			// The CDN still wants the signed token, even for a plain MP4.
			const url = new URL(quality.sourceURL);
			if (token?.signature) {
				url.searchParams.set('sig', token.signature);
				url.searchParams.set('token', token.value);
			}

			return {
				name: height ? `${height}p${frameRate ?? ''}` : 'original',
				width: null,
				height,
				frameRate,
				bandwidth: 0,
				url: url.href,
			};
		})
		.sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
}

export async function getClip(slug) {
	const data = await gql(
		`query ($slug: ID!) {
			clip(slug: $slug) {
				slug title durationSeconds createdAt viewCount
				broadcaster { login }
				game { name }
				videoQualities { quality sourceURL }
				playbackAccessToken(${TOKEN_PARAMS}) { value signature }
			}
		}`,
		{ slug }
	);

	const clip = data.clip;
	if (!clip) throw new UserFacingError(`Twitch has no clip "${slug}".`);

	const variants = clipVariants(clip);
	if (variants.length === 0) throw new UserFacingError(`Clip "${slug}" has no downloadable video.`);

	return { ...normalizeClip(clip), variants };
}

/**
 * A listing entry carries no stream URL, because getting one means asking for a
 * signed token per entry — twenty requests to draw a menu. This fills that in
 * for the single item that was actually chosen.
 */
export async function resolvePlayable(media) {
	if (media.masterUrl || media.directUrl || media.variants?.length) return media;
	return media.kind === 'clip' ? getClip(media.id) : getVideo(media.id);
}

/** Twitch caps a page at 100; asking for more is an error rather than a clamp. */
function pageSize(limit) {
	return Math.max(1, Math.min(Number(limit) || 20, 100));
}

function edgesOf(connection, channel, what) {
	if (!connection) {
		throw new UserFacingError(`Twitch has no channel "${channel}".`, `Check the spelling — a login is what appears in the URL.`);
	}
	return (connection[what]?.edges ?? []).map((edge) => edge.node).filter(Boolean);
}

export async function getChannelVods(channel, { limit = 20 } = {}) {
	const data = await gql(
		`query ($login: String!, $first: Int!) {
			user(login: $login) {
				videos(first: $first, type: ARCHIVE, sort: TIME) {
					edges { node { ${MEDIA_FIELDS} } }
				}
			}
		}`,
		{ login: channel, first: pageSize(limit) }
	);

	return edgesOf(data.user, channel, 'videos').map((video) => normalizeVod(video, channel));
}

export async function getChannelClips(channel, { limit = 20 } = {}) {
	// Sorted by views rather than by date: it is the only ordering the clips
	// connection reliably accepts, and it is what Twitch's own clips tab shows.
	const data = await gql(
		`query ($login: String!, $first: Int!) {
			user(login: $login) {
				clips(first: $first, criteria: { period: ALL_TIME, sort: VIEWS_DESC }) {
					edges {
						node {
							slug title durationSeconds createdAt viewCount
							broadcaster { login }
							game { name }
						}
					}
				}
			}
		}`,
		{ login: channel, first: pageSize(limit) }
	);

	return edgesOf(data.user, channel, 'clips').map((clip) => normalizeClip(clip, channel));
}
