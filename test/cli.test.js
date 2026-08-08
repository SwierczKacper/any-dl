import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFilename } from '../src/cli.js';

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
