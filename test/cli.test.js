import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFilename, qualityChoices } from '../src/cli.js';

const VOD = {
	channel: 'xmerghani',
	// Kick's listing format: UTC without an offset.
	startTime: '2026-08-07 17:28:32',
	title: 'LAST DANCE GTA RP - STREFA.RP [DAY 1]| !sklep !skins !holy !swap !steel',
};

test('buildFilename joins channel, date and title', () => {
	assert.equal(buildFilename(VOD), 'xmerghani - 2026-08-07 - LAST DANCE GTA RP - STREFA.RP [DAY 1].mp4');
});

test('buildFilename leaves the quality out', () => {
	assert.ok(!buildFilename(VOD).includes('1080p60'));
	assert.ok(!/\[\d{3,4}p\d*\]/.test(buildFilename(VOD)));
});

test('buildFilename copes with a missing start time', () => {
	const name = buildFilename({ ...VOD, startTime: null });
	assert.equal(name, 'xmerghani - LAST DANCE GTA RP - STREFA.RP [DAY 1].mp4');
});

test('buildFilename copes with a missing title', () => {
	assert.equal(buildFilename({ ...VOD, title: '' }), 'xmerghani - 2026-08-07 - untitled.mp4');
});

test('buildFilename always ends in .mp4', () => {
	assert.ok(buildFilename(VOD).endsWith('.mp4'));
	assert.ok(buildFilename({ channel: 'x', startTime: null, title: '' }).endsWith('.mp4'));
});

test('buildFilename folds accents so the name is portable', () => {
	const name = buildFilename({ ...VOD, title: 'WIELKI UPDATE DO GOLFA - BITWA STREAMERÓW' });
	assert.equal(name, 'xmerghani - 2026-08-07 - WIELKI UPDATE DO GOLFA - BITWA STREAMEROW.mp4');
});

const VARIANTS = [
	{ name: '1080p60', width: 1920, height: 1080, bandwidth: 8_660_776 },
	{ name: '720p60', width: 1280, height: 720, bandwidth: 3_331_553 },
	{ name: '160p30', width: 284, height: 160, bandwidth: 230_000 },
];

test('qualityChoices lists every variant with its estimated size', () => {
	const choices = qualityChoices(VARIANTS, 3600);
	assert.equal(choices.length, 3);
	assert.match(choices[0].name, /1080p60/);
	assert.match(choices[0].name, /1920x1080/);
	assert.match(choices[0].name, /8\.66 Mbps/);
	assert.match(choices[0].name, /~3\.6 GB/);
});

test('qualityChoices marks the first entry as recommended', () => {
	const choices = qualityChoices(VARIANTS, 3600);
	assert.match(choices[0].name, /\(recommended\)/);
	assert.ok(!choices[1].name.includes('(recommended)'));
});

test('qualityChoices returns the variant itself as the value', () => {
	assert.equal(qualityChoices(VARIANTS, 60)[1].value, VARIANTS[1]);
});

test('qualityChoices aligns the columns', () => {
	// Ragged columns are unreadable in a picker, so the padding matters.
	const choices = qualityChoices(VARIANTS, 3600);
	const positions = choices.map((choice) => choice.name.indexOf('Mbps'));
	assert.equal(new Set(positions).size, 1, `Mbps column not aligned: ${positions}`);
});

test('qualityChoices copes with an unknown duration', () => {
	const choices = qualityChoices(VARIANTS, 0);
	assert.match(choices[0].name, /1080p60/);
	assert.ok(!choices[0].name.includes('~'));
});

test('qualityChoices flags variants that will not fit on disk', () => {
	const oneGigabyte = 1024 ** 3;
	const choices = qualityChoices(VARIANTS, 3600, oneGigabyte);

	assert.match(choices[0].name, /not enough space/); // ~3.6 GB
	assert.match(choices[1].name, /not enough space/); // ~1.4 GB
	assert.ok(!choices[2].name.includes('not enough space')); // ~98.7 MB fits
});

test('qualityChoices says nothing about space when it is unknown', () => {
	for (const choice of qualityChoices(VARIANTS, 3600, null)) {
		assert.ok(!choice.name.includes('not enough space'));
	}
});

test('qualityChoices drops the recommendation marker when that variant will not fit', () => {
	const choices = qualityChoices(VARIANTS, 3600, 1024 ** 3);
	assert.ok(!choices[0].name.includes('(recommended)'));
});

// A clip's sizes as a provider hands them over: a height, sometimes a frame
// rate, and nothing else. No width, no bitrate, so no size estimate either.
const CLIP_VARIANTS = [
	{ name: '1080p', width: null, height: 1080, frameRate: null, bandwidth: 0, url: 'https://cdn.test/1080.mp4' },
	{ name: '720p', width: null, height: 720, frameRate: null, bandwidth: 0, url: 'https://cdn.test/720.mp4' },
];

test('qualityChoices drops the columns nothing can fill', () => {
	const [best] = qualityChoices(CLIP_VARIANTS, 30);
	// "unknown  <blank>  <blank>" is three columns of noise beside the one
	// piece of information there is.
	assert.ok(!best.name.includes('unknown'), best.name);
	assert.ok(!best.name.includes('Mbps'), best.name);
	assert.equal(best.name, '1080p   (recommended)');
});

test('qualityChoices leaves no padding hanging off the end of a line', () => {
	const choices = qualityChoices(CLIP_VARIANTS, 30);
	assert.equal(choices[1].name, '720p');
});

test('qualityChoices keeps every column when the data is there', () => {
	// The VOD case must not lose anything to the rule above.
	const [best] = qualityChoices(VARIANTS, 3600);
	assert.match(best.name, /1920x1080/);
	assert.match(best.name, /Mbps/);
	assert.match(best.name, /~/);
});

test('qualityChoices cannot warn about disk space it cannot estimate', () => {
	// No bitrate means no size, and a warning would be invented rather than
	// measured — the picker stays quiet instead.
	const choices = qualityChoices(CLIP_VARIANTS, 30, 1);
	assert.ok(!choices.some((choice) => choice.name.includes('not enough space')));
});
