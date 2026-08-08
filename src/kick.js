import { fetchJson } from './browser.js';
import { isUuid, parseKickDate, UserFacingError, uuidV7Timestamp } from './util.js';

const API_BASE = 'https://kick.com/api';

/**
 * Work out what the user gave us: a VOD link, a clip link, a bare UUID,
 * or just a channel name.
 */
export function parseTarget(input) {
	const raw = String(input ?? '').trim();
	if (!raw) throw new UserFacingError('No channel or link given.');

	if (/^https?:\/\//i.test(raw)) return parseUrl(raw);
	if (isUuid(raw)) return { type: 'video', uuid: raw };
	if (/^clip_/i.test(raw)) return { type: 'clip', id: raw };

	const channel = raw.replace(/^@/, '');
	if (!/^[\w.-]+$/.test(channel)) {
		throw new UserFacingError(`"${raw}" is neither a valid Kick link nor a channel name.`);
	}
	return { type: 'channel', channel };
}

function parseUrl(rawUrl) {
	let url;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new UserFacingError(`Not a valid URL: ${rawUrl}`);
	}

	if (!/(^|\.)kick\.com$/i.test(url.hostname)) {
		throw new UserFacingError(`Not a kick.com link: ${rawUrl}`);
	}

	// https://kick.com/<channel>?clip=clip_XXXX
	const clipQuery = url.searchParams.get('clip');
	if (clipQuery) return { type: 'clip', id: clipQuery };

	const segments = url.pathname.split('/').filter(Boolean);

	// https://kick.com/video/<uuid>  |  https://kick.com/<channel>/videos/<uuid>
	const videoIndex = segments.findIndex((segment) => segment === 'video' || segment === 'videos');
	if (videoIndex !== -1 && segments[videoIndex + 1]) {
		return {
			type: 'video',
			uuid: segments[videoIndex + 1],
			channel: videoIndex > 0 ? segments[0] : undefined,
		};
	}

	// https://kick.com/<channel>/clips/<clip_id>
	const clipIndex = segments.findIndex((segment) => segment === 'clips' || segment === 'clip');
	if (clipIndex !== -1 && segments[clipIndex + 1]) {
		return { type: 'clip', id: segments[clipIndex + 1], channel: segments[0] };
	}

	if (segments.length === 1) return { type: 'channel', channel: segments[0] };

	throw new UserFacingError(`Could not tell what this link points at: ${rawUrl}`);
}

/** Shape the different Kick payloads into one consistent object. */
function normalizeVod({ uuid, source, livestream, channelName }) {
	const durationMs = Number(livestream?.duration) || 0;

	return {
		kind: 'vod',
		uuid,
		title: livestream?.session_title?.trim() || 'Untitled stream',
		channel: channelName || livestream?.channel?.slug || livestream?.channel?.user?.username || 'kick',
		startTime: livestream?.start_time || livestream?.created_at || null,
		durationSec: durationMs > 0 ? durationMs / 1000 : null,
		views: Number(livestream?.views ?? livestream?.viewer_count) || 0,
		category: livestream?.categories?.[0]?.name || null,
		masterUrl: source || livestream?.source || null,
	};
}

/** How far apart a UUIDv7 timestamp and a listed start_time may be and still count as the same stream. */
const START_TIME_TOLERANCE_MS = 10_000;

export async function getVideo(uuid, { channel } = {}) {
	const data = await fetchJson(`${API_BASE}/v1/video/${encodeURIComponent(uuid)}`);

	if (data?.source) {
		return normalizeVod({ uuid: data.uuid ?? uuid, source: data.source, livestream: data.livestream });
	}

	// Newer links carry a UUIDv7 that the v1 endpoint does not know. Its embedded
	// timestamp is the stream's start time, so we can find the same VOD in the
	// channel listing instead.
	const startedAt = uuidV7Timestamp(uuid);
	if (startedAt && channel) {
		const match = await findVodByStartTime(channel, startedAt);
		if (match) return match;
	}

	throw new UserFacingError(
		`VOD ${uuid} has no playable source.`,
		startedAt && !channel
			? 'Use the full link that includes the channel name, e.g. https://kick.com/<channel>/videos/<id>.'
			: 'It may be private, deleted, or already pruned by Kick.'
	);
}

async function findVodByStartTime(channel, startedAt) {
	const candidates = await getChannelVods(channel, { limit: 100 });

	return candidates.find((vod) => {
		const listed = parseKickDate(vod.startTime);
		return listed != null && Math.abs(listed.getTime() - startedAt.getTime()) <= START_TIME_TOLERANCE_MS;
	});
}

export async function getChannelVods(channel, { limit = 20 } = {}) {
	const data = await fetchJson(
		`${API_BASE}/v2/channels/${encodeURIComponent(channel)}/videos?cursor=0&sort=date&time=all`
	);

	if (!Array.isArray(data)) {
		throw new UserFacingError(`Channel "${channel}" not found, or it has no VODs.`);
	}

	return data
		.slice(0, limit)
		.map((entry) =>
			normalizeVod({
				uuid: entry.video?.uuid,
				source: entry.source,
				livestream: entry,
				channelName: channel,
			})
		)
		.filter((vod) => vod.masterUrl);
}

export async function getChannelClips(channel, { limit = 20 } = {}) {
	const data = await fetchJson(
		`${API_BASE}/v2/channels/${encodeURIComponent(channel)}/clips?cursor=0&sort=date&time=all`
	);

	const clips = data?.clips ?? data;
	if (!Array.isArray(clips)) {
		throw new UserFacingError(`Channel "${channel}" not found, or it has no clips.`);
	}

	return clips.slice(0, limit).map((clip) => normalizeClip(clip, channel));
}

function normalizeClip(clip, channelName) {
	return {
		kind: 'clip',
		uuid: clip.id,
		title: clip.title?.trim() || 'Untitled clip',
		channel: channelName || clip.channel?.slug || 'kick',
		startTime: clip.created_at || null,
		durationSec: Number(clip.duration) || null,
		views: Number(clip.views) || 0,
		category: clip.category?.name || null,
		// Clips are served as a plain MP4 — no HLS master involved.
		directUrl: clip.clip_url || clip.video_url || null,
		masterUrl: null,
	};
}

export async function getClip(id) {
	const data = await fetchJson(`${API_BASE}/v2/clips/${encodeURIComponent(id)}`);
	const clip = data?.clip ?? data;

	if (!clip || (!clip.clip_url && !clip.video_url)) {
		throw new UserFacingError(`Clip ${id} has no downloadable video.`);
	}

	return normalizeClip(clip, clip.channel?.slug);
}
