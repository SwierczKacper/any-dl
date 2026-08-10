import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMediaPlaylist, selectSegmentRange } from '../src/segments.js';
import { UserFacingError } from '../src/util.js';

const PLAYLIST_URL = 'https://cdn.example.net/vod/720p60/index-muted-ABC.m3u8';

// Shortened from a real Twitch VOD playlist, including a -muted segment: Twitch
// renames segments whose audio was removed, and only the URI says so.
const TWITCH_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:13
#ID3-EQUIV-TDTG:2026-08-10T07:09:35
#EXT-X-PLAYLIST-TYPE:EVENT
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-TWITCH-ELAPSED-SECS:0.000
#EXT-X-TWITCH-TOTAL-SECS:32624.417
#EXTINF:10.000,
0.ts
#EXTINF:10.000,
1.ts
#EXTINF:10.000,
2-muted.ts
#EXTINF:4.500,
3.ts
#EXT-X-ENDLIST
`;

// Kick runs on AWS IVS, which came out of Twitch: the same tags, plus a
// program date time before every segment.
const KICK_PLAYLIST = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:13
#EXT-X-PLAYLIST-TYPE:EVENT
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-TWITCH-TOTAL-SECS:32621.817
#EXT-X-PROGRAM-DATE-TIME:2026-08-09T22:05:47.225Z
#EXTINF:10.000,
0.ts
#EXT-X-PROGRAM-DATE-TIME:2026-08-09T22:05:57.225Z
#EXTINF:10.000,
1.ts
#EXT-X-ENDLIST
`;

test('parseMediaPlaylist reads every segment with its position in the stream', () => {
	const { segments, totalSeconds, complete } = parseMediaPlaylist(TWITCH_PLAYLIST, PLAYLIST_URL);

	assert.equal(segments.length, 4);
	assert.equal(complete, true);
	assert.equal(totalSeconds, 34.5);
	assert.deepEqual(
		segments.map((segment) => segment.start),
		[0, 10, 20, 30]
	);
	assert.equal(segments[0].url, 'https://cdn.example.net/vod/720p60/0.ts');
	assert.equal(segments[2].url, 'https://cdn.example.net/vod/720p60/2-muted.ts');
	assert.equal(segments[3].seconds, 4.5);
});

test('parseMediaPlaylist ignores the tags Kick adds around each segment', () => {
	const { segments, totalSeconds } = parseMediaPlaylist(KICK_PLAYLIST, PLAYLIST_URL);

	assert.equal(segments.length, 2);
	assert.equal(totalSeconds, 20);
});

test('parseMediaPlaylist reports a still-running broadcast as incomplete', () => {
	const live = TWITCH_PLAYLIST.replace('#EXT-X-ENDLIST\n', '');
	assert.equal(parseMediaPlaylist(live, PLAYLIST_URL).complete, false);
});

test('parseMediaPlaylist resolves absolute segment URIs unchanged', () => {
	const absolute = `#EXTM3U
#EXTINF:10.000,
https://other.example.net/vod/0.ts
#EXT-X-ENDLIST
`;
	const { segments } = parseMediaPlaylist(absolute, PLAYLIST_URL);
	assert.equal(segments[0].url, 'https://other.example.net/vod/0.ts');
});

test('parseMediaPlaylist refuses an encrypted playlist rather than writing noise', () => {
	const encrypted = TWITCH_PLAYLIST.replace(
		'#EXTINF:10.000,\n0.ts',
		'#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example.net/key"\n#EXTINF:10.000,\n0.ts'
	);
	assert.throws(() => parseMediaPlaylist(encrypted, PLAYLIST_URL), UserFacingError);
});

test('parseMediaPlaylist accepts METHOD=NONE, which means exactly "not encrypted"', () => {
	const declared = TWITCH_PLAYLIST.replace(
		'#EXTINF:10.000,\n0.ts',
		'#EXT-X-KEY:METHOD=NONE\n#EXTINF:10.000,\n0.ts'
	);
	assert.equal(parseMediaPlaylist(declared, PLAYLIST_URL).segments.length, 4);
});

test('parseMediaPlaylist refuses formats it cannot concatenate', () => {
	const fragmented = TWITCH_PLAYLIST.replace('#EXTINF:10.000,\n0.ts', '#EXT-X-MAP:URI="init.mp4"\n#EXTINF:10.000,\n0.ts');
	assert.throws(() => parseMediaPlaylist(fragmented, PLAYLIST_URL), UserFacingError);

	const ranged = TWITCH_PLAYLIST.replace('#EXTINF:10.000,\n0.ts', '#EXTINF:10.000,\n#EXT-X-BYTERANGE:75232@0\n0.ts');
	assert.throws(() => parseMediaPlaylist(ranged, PLAYLIST_URL), UserFacingError);
});

test('parseMediaPlaylist rejects a playlist with nothing in it', () => {
	assert.throws(() => parseMediaPlaylist('#EXTM3U\n#EXT-X-ENDLIST\n', PLAYLIST_URL), UserFacingError);
});

const RANGE_SEGMENTS = parseMediaPlaylist(TWITCH_PLAYLIST, PLAYLIST_URL).segments;

test('selectSegmentRange takes everything when no range was asked for', () => {
	const { segments, leadingSeconds } = selectSegmentRange(RANGE_SEGMENTS);
	assert.equal(segments.length, 4);
	assert.equal(leadingSeconds, 0);
});

test('selectSegmentRange keeps the segment a cut lands inside, and says how far in', () => {
	const { segments, leadingSeconds } = selectSegmentRange(RANGE_SEGMENTS, { from: 14 });

	assert.deepEqual(
		segments.map((segment) => segment.index),
		[1, 2, 3]
	);
	// The wanted range starts 4s into segment 1, which begins at 10s.
	assert.equal(leadingSeconds, 4);
});

test('selectSegmentRange stops at the last segment the range touches', () => {
	const { segments } = selectSegmentRange(RANGE_SEGMENTS, { from: 5, to: 21 });
	assert.deepEqual(
		segments.map((segment) => segment.index),
		[0, 1, 2]
	);
});

test('selectSegmentRange does not drag in a segment that merely ends on the cut', () => {
	// from: 10 begins exactly where segment 1 does, so segment 0 is not wanted.
	const { segments, leadingSeconds } = selectSegmentRange(RANGE_SEGMENTS, { from: 10 });
	assert.equal(segments[0].index, 1);
	assert.equal(leadingSeconds, 0);
});

test('selectSegmentRange refuses a range beyond the end of the video', () => {
	assert.throws(() => selectSegmentRange(RANGE_SEGMENTS, { from: 600 }), UserFacingError);
});
