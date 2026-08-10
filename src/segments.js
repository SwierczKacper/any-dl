import { getText } from './http.js';
import { UserFacingError } from './util.js';

/**
 * Media playlists — the list of segments a variant is actually made of.
 *
 * `hls.js` reads the master playlist and answers "which qualities exist"; this
 * reads one of those qualities and answers "which pieces is it made of, and
 * where does each one sit in time". Handing ffmpeg the playlist URL leaves both
 * questions to ffmpeg, which is why a download today cannot be resumed, cannot
 * retry a single failed piece, and cannot start anywhere but the beginning
 * without ffmpeg reading its way there.
 *
 * Both supported sites serve plain MPEG-TS at HLS version 3 — no encryption, no
 * initialisation segment, no byte ranges. Kick runs on AWS IVS, which grew out
 * of Twitch, so its playlists carry Twitch's own tags and are the same shape.
 * The unsupported cases below are therefore about failing clearly if a site
 * changes, not about formats seen in the wild.
 */

/** Parsed from `#EXTINF:<seconds>,<title>` — the title is optional and unused. */
function parseExtinf(line) {
	const seconds = Number.parseFloat(line.slice('#EXTINF:'.length));
	return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function attributeOf(line, name) {
	const match = line.match(new RegExp(`${name}=("[^"]*"|[^,]*)`));
	return match ? match[1].replace(/^"|"$/g, '') : null;
}

/**
 * Turn a media playlist into the segments it lists, each with its position in
 * the stream so a range can be picked without fetching anything.
 *
 * Returns `{ segments, totalSeconds, complete }`. `complete` is false for a
 * playlist with no `#EXT-X-ENDLIST` — a broadcast still running, where the list
 * is a snapshot rather than the whole stream.
 */
export function parseMediaPlaylist(text, playlistUrl) {
	const lines = text.split(/\r?\n/);
	const segments = [];
	let pendingSeconds = null;
	let start = 0;
	let complete = false;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;

		if (line.startsWith('#')) {
			if (line.startsWith('#EXTINF:')) {
				pendingSeconds = parseExtinf(line);
				continue;
			}
			if (line === '#EXT-X-ENDLIST') {
				complete = true;
				continue;
			}
			if (line.startsWith('#EXT-X-KEY:')) {
				// METHOD=NONE is a formal way of saying "not encrypted from here on",
				// and is fine. Anything else would need the key fetched and every
				// segment decrypted, which nothing here does — better to say so than
				// to write a file of noise.
				const method = attributeOf(line, 'METHOD');
				if (method && method !== 'NONE') {
					throw new UserFacingError(
						`This stream is encrypted (${method}), which is not supported.`,
						'Please report the link — no supported site has served an encrypted playlist before.'
					);
				}
				continue;
			}
			if (line.startsWith('#EXT-X-BYTERANGE:')) {
				throw new UserFacingError(
					'This stream packs several segments into one file, which is not supported.',
					'Please report the link — no supported site has served a playlist like this before.'
				);
			}
			// #EXT-X-MAP would mean fragmented MP4 rather than MPEG-TS, where the
			// segments are meaningless without the initialisation segment in front.
			if (line.startsWith('#EXT-X-MAP:')) {
				throw new UserFacingError(
					'This stream uses a format that is not supported yet (fragmented MP4).',
					'Please report the link — both supported sites serve MPEG-TS.'
				);
			}
			// Everything else is informational: #EXT-X-DISCONTINUITY, the Twitch
			// counters, program date times. TS segments concatenate across a
			// discontinuity and ffmpeg re-times them when remuxing.
			continue;
		}

		// A URI line only counts as a segment when an #EXTINF introduced it.
		if (pendingSeconds == null) continue;

		segments.push({
			index: segments.length,
			url: new URL(line, playlistUrl).href,
			seconds: pendingSeconds,
			start,
		});
		start += pendingSeconds;
		pendingSeconds = null;
	}

	if (segments.length === 0) {
		throw new UserFacingError('The playlist listed no segments to download.');
	}

	return { segments, totalSeconds: start, complete };
}

export async function getSegments(playlistUrl) {
	const text = await getText(playlistUrl, {
		hint: 'The video may have been pruned, made private, or restricted to subscribers.',
	});
	return parseMediaPlaylist(text, playlistUrl);
}

/**
 * The segments covering `from`–`to`, plus how far into the first one the wanted
 * range actually begins.
 *
 * Segments are whole units, so a cut almost never lands on a boundary: the
 * first one is kept in full and `leadingSeconds` says how much of it to trim
 * afterwards. That trim is what keeps `--from` frame-accurate while still only
 * fetching the part of the stream that was asked for.
 */
export function selectSegmentRange(segments, { from = null, to = null } = {}) {
	if (from == null && to == null) {
		return { segments, leadingSeconds: 0 };
	}

	const start = from ?? 0;
	const wanted = segments.filter((segment) => {
		const end = segment.start + segment.seconds;
		// A segment is in range when it overlaps it at all: `end > start` rather
		// than `>=` so a cut exactly on a boundary does not drag in the segment
		// that merely finishes there.
		if (end <= start) return false;
		if (to != null && segment.start >= to) return false;
		return true;
	});

	if (wanted.length === 0) {
		throw new UserFacingError(
			'The requested range falls outside this video.',
			`The video is ${Math.round(segments.at(-1).start + segments.at(-1).seconds)}s long.`
		);
	}

	return { segments: wanted, leadingSeconds: start - wanted[0].start };
}
