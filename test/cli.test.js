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
