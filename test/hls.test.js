import assert from 'node:assert/strict';
import test from 'node:test';

import { describeVariant, estimateBytes, parseMasterPlaylist, selectVariant } from '../src/hls.js';

const MASTER_URL = 'https://stream.example.com/ivs/v1/media/hls/master.m3u8';

const MASTER_PLAYLIST = `#EXTM3U
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="1080p60",NAME="1080p60",AUTOSELECT=YES,DEFAULT=YES
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=8660776,CODECS="avc1.64002A,mp4a.40.2",RESOLUTION=1920x1080,VIDEO="1080p60",FRAME-RATE=60.000
1080p60/playlist.m3u8
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="720p60",NAME="720p60",AUTOSELECT=YES,DEFAULT=NO
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=3331553,CODECS="avc1.4D401F,mp4a.40.2",RESOLUTION=1280x720,VIDEO="720p60",FRAME-RATE=60.000
720p60/playlist.m3u8
#EXT-X-MEDIA:TYPE=VIDEO,GROUP-ID="480p30",NAME="480p",AUTOSELECT=YES,DEFAULT=NO
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1336553,CODECS="avc1.4D401F,mp4a.40.2",RESOLUTION=852x480,VIDEO="480p30",FRAME-RATE=30.000
480p30/playlist.m3u8
`;

test('parseMasterPlaylist extracts every variant', () => {
	const variants = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	assert.equal(variants.length, 3);
	assert.deepEqual(
		variants.map((variant) => variant.name),
		['1080p60', '720p60', '480p30']
	);
});

test('parseMasterPlaylist sorts by bitrate, best first', () => {
	const variants = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	const bandwidths = variants.map((variant) => variant.bandwidth);
	assert.deepEqual(bandwidths, [...bandwidths].sort((a, b) => b - a));
});

test('parseMasterPlaylist reads resolution and frame rate', () => {
	const [best] = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	assert.equal(best.width, 1920);
	assert.equal(best.height, 1080);
	assert.equal(best.frameRate, 60);
	assert.equal(best.bandwidth, 8660776);
});

test('parseMasterPlaylist resolves variant URLs against the master', () => {
	const [best] = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	assert.equal(best.url, 'https://stream.example.com/ivs/v1/media/hls/1080p60/playlist.m3u8');
});

test('parseMasterPlaylist rejects a playlist with no variants', () => {
	assert.throws(() => parseMasterPlaylist('#EXTM3U\n', MASTER_URL), /no video variants/);
});

test('selectVariant defaults to the best quality', () => {
	const variants = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	assert.equal(selectVariant(variants).name, '1080p60');
	assert.equal(selectVariant(variants, 'best').name, '1080p60');
	assert.equal(selectVariant(variants, 'BEST').name, '1080p60');
});

test('selectVariant supports worst', () => {
	const variants = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	assert.equal(selectVariant(variants, 'worst').name, '480p30');
});

test('selectVariant matches an exact variant name', () => {
	const variants = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	assert.equal(selectVariant(variants, '720p60').name, '720p60');
});

test('selectVariant matches a bare height', () => {
	const variants = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	assert.equal(selectVariant(variants, '720').name, '720p60');
	assert.equal(selectVariant(variants, '720p').name, '720p60');
});

test('selectVariant steps down when the exact height is missing', () => {
	const variants = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	// 900p does not exist, so the best variant at or below it wins.
	assert.equal(selectVariant(variants, '900').name, '720p60');
});

test('selectVariant reports what is available when nothing matches', () => {
	const variants = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	assert.throws(() => selectVariant(variants, '4k'), /not available/);
});

test('describeVariant renders resolution and bitrate', () => {
	const [best] = parseMasterPlaylist(MASTER_PLAYLIST, MASTER_URL);
	assert.equal(describeVariant(best), '1080p60 (1920x1080, 8.66 Mbps)');
});

test('estimateBytes turns a bitrate and a duration into a size', () => {
	// 8 Mbps for 10 seconds is 10 MB.
	assert.equal(estimateBytes({ bandwidth: 8_000_000 }, 10), 10_000_000);
});

test('estimateBytes lands close to a real download', () => {
	// A measured hour of Kick's 1080p60 came to 3.4 GiB; BANDWIDTH is the peak
	// rate, so the estimate should sit slightly above that, never below.
	const estimate = estimateBytes({ bandwidth: 8_660_776 }, 3600);
	const measured = 3.4 * 1024 ** 3;
	assert.ok(estimate > measured, 'estimate must not undersell the size');
	assert.ok(estimate < measured * 1.2, `estimate too high: ${estimate / 1024 ** 3} GiB`);
});

test('estimateBytes gives up when there is nothing to go on', () => {
	assert.equal(estimateBytes({ bandwidth: 0 }, 60), null);
	assert.equal(estimateBytes({ bandwidth: 8_000_000 }, 0), null);
	assert.equal(estimateBytes({ bandwidth: 8_000_000 }, NaN), null);
	assert.equal(estimateBytes(null, 60), null);
});
