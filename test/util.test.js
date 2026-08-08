import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	isUuid,
	normalizeTitle,
	parseKickDate,
	parseTimecode,
	resolveOutputDir,
	sanitizeFilename,
	uniquePath,
	uuidV7Timestamp,
} from '../src/util.js';

test('sanitizeFilename keeps spaces and readable characters', () => {
	assert.equal(sanitizeFilename('LAST DANCE GTA RP'), 'LAST DANCE GTA RP');
});

test('sanitizeFilename strips characters filesystems reject', () => {
	assert.equal(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij');
});

test('sanitizeFilename collapses whitespace and trims dots', () => {
	assert.equal(sanitizeFilename('  ..spaced   out..  '), 'spaced out');
});

test('sanitizeFilename truncates to the requested length', () => {
	assert.equal(sanitizeFilename('x'.repeat(200), 10).length, 10);
});

test('sanitizeFilename falls back when nothing usable remains', () => {
	assert.equal(sanitizeFilename('///'), 'kick-video');
	assert.equal(sanitizeFilename(''), 'kick-video');
	assert.equal(sanitizeFilename(null), 'kick-video');
});

test('sanitizeFilename avoids names reserved on Windows', () => {
	assert.equal(sanitizeFilename('CON'), 'kick-video');
	assert.equal(sanitizeFilename('lpt1'), 'kick-video');
});

test('uniquePath returns the plain path when nothing is in the way', () => {
	const dir = mkdtempSync(join(tmpdir(), 'kick-vod-test-'));
	assert.equal(uniquePath(dir, 'video.mp4'), join(dir, 'video.mp4'));
});

test('uniquePath never overwrites an existing file', () => {
	const dir = mkdtempSync(join(tmpdir(), 'kick-vod-test-'));
	writeFileSync(join(dir, 'video.mp4'), '');
	assert.equal(uniquePath(dir, 'video.mp4'), join(dir, 'video (2).mp4'));

	writeFileSync(join(dir, 'video (2).mp4'), '');
	assert.equal(uniquePath(dir, 'video.mp4'), join(dir, 'video (3).mp4'));
});

test('parseTimecode understands every accepted shape', () => {
	assert.equal(parseTimecode('90'), 90);
	assert.equal(parseTimecode('1:30'), 90);
	assert.equal(parseTimecode('01:23:45'), 5025);
	assert.equal(parseTimecode('00:00:04.5'), 4.5);
	assert.equal(parseTimecode(' 10 '), 10);
});

test('parseTimecode rejects nonsense', () => {
	for (const bad of ['abc', '', '1:2:3:4', '-5', '1:2:3.', null, undefined]) {
		assert.equal(parseTimecode(bad), null, `expected null for ${JSON.stringify(bad)}`);
	}
});

test('isUuid accepts canonical uuids only', () => {
	assert.ok(isUuid('d3498feb-7e9a-413e-a5b0-f006f3b2c902'));
	assert.ok(isUuid('019FDD44-F600-7184-BF35-FF795A9B372C'));
	assert.equal(isUuid('not-a-uuid'), false);
	assert.equal(isUuid('d3498feb7e9a413ea5b0f006f3b2c902'), false);
});

test('uuidV7Timestamp decodes the embedded start time', () => {
	const decoded = uuidV7Timestamp('019fdd44-f600-7184-bf35-ff795a9b372c');
	assert.equal(decoded.toISOString(), '2026-08-07T17:28:32.000Z');
});

test('uuidV7Timestamp ignores other uuid versions', () => {
	assert.equal(uuidV7Timestamp('d3498feb-7e9a-413e-a5b0-f006f3b2c902'), null);
	assert.equal(uuidV7Timestamp('nonsense'), null);
});

test('parseKickDate treats a missing timezone as UTC', () => {
	// Kick returns this form in channel listings; Date() alone would read it as local time.
	assert.equal(parseKickDate('2026-08-07 17:28:32').toISOString(), '2026-08-07T17:28:32.000Z');
});

test('parseKickDate honours an explicit offset', () => {
	assert.equal(parseKickDate('2026-08-07T17:28:32+00:00').toISOString(), '2026-08-07T17:28:32.000Z');
	assert.equal(parseKickDate('2026-08-07T19:28:32+02:00').toISOString(), '2026-08-07T17:28:32.000Z');
});

test('parseKickDate agrees across both Kick formats for the same instant', () => {
	assert.equal(
		parseKickDate('2026-08-07 17:28:32').getTime(),
		parseKickDate('2026-08-07T17:28:32+00:00').getTime()
	);
});

test('parseKickDate returns null for junk', () => {
	assert.equal(parseKickDate('not a date'), null);
	assert.equal(parseKickDate(null), null);
	assert.equal(parseKickDate(''), null);
});

test('normalizeTitle strips trailing chat commands', () => {
	assert.equal(
		normalizeTitle('LAST DANCE GTA RP - STREFA.RP [DAY 1]| !sklep !skins !holy !swap !steel'),
		'LAST DANCE GTA RP - STREFA.RP [DAY 1]'
	);
});

test('normalizeTitle strips chat commands wherever they appear', () => {
	assert.equal(normalizeTitle('!drop grind na rankingu !sklep'), 'grind na rankingu');
});

test('normalizeTitle keeps Polish characters intact', () => {
	assert.equal(normalizeTitle('WIELKI UPDATE DO GOLFA - BITWA STREAMERÓW'), 'WIELKI UPDATE DO GOLFA - BITWA STREAMERÓW');
	assert.equal(normalizeTitle('zażółć gęślą jaźń'), 'zażółć gęślą jaźń');
});

test('normalizeTitle drops exclamation marks that upset shells', () => {
	assert.equal(normalizeTitle('WOW! ale gra'), 'WOW ale gra');
});

test('normalizeTitle cuts at a word boundary', () => {
	const result = normalizeTitle('alpha bravo charlie delta echo foxtrot golf hotel india', 30);
	assert.ok(result.length <= 30);
	assert.ok(!result.endsWith('-'), 'must not end on a separator');
	assert.equal(result, 'alpha bravo charlie delta echo');
});

test('normalizeTitle falls back when only commands remain', () => {
	assert.equal(normalizeTitle('!sklep !skins'), 'untitled');
	assert.equal(normalizeTitle(''), 'untitled');
	assert.equal(normalizeTitle(null), 'untitled');
});

test('resolveOutputDir defaults to the current directory', () => {
	assert.equal(resolveOutputDir({ cwd: '/home/u/work' }), '/home/u/work');
});

test('resolveOutputDir prefers --dir over the environment', () => {
	const dir = resolveOutputDir({ dir: '/explicit', envDir: '/from-env', cwd: '/home/u' });
	assert.equal(dir, '/explicit');
});

test('resolveOutputDir uses KICK_VOD_DIR when no --dir is given', () => {
	assert.equal(resolveOutputDir({ envDir: '/from-env', cwd: '/home/u' }), '/from-env');
});

test('resolveOutputDir resolves a relative directory against the cwd', () => {
	assert.equal(resolveOutputDir({ dir: 'out', cwd: '/home/u/work' }), '/home/u/work/out');
});

test('resolveOutputDir expands a leading tilde', () => {
	const dir = resolveOutputDir({ dir: '~/Videos', cwd: '/somewhere' });
	assert.equal(dir, join(homedir(), 'Videos'));
});

test('resolveOutputDir adds a channel subdirectory when asked', () => {
	const dir = resolveOutputDir({ dir: '/videos', channel: 'xmerghani', perChannel: true, cwd: '/home/u' });
	assert.equal(dir, '/videos/xmerghani');
});

test('resolveOutputDir ignores the channel subdirectory without a channel', () => {
	assert.equal(resolveOutputDir({ dir: '/videos', perChannel: true, cwd: '/home/u' }), '/videos');
});

test('resolveOutputDir keeps a hostile channel name from escaping the directory', () => {
	const dir = resolveOutputDir({ dir: '/videos', channel: '../../etc', perChannel: true, cwd: '/home/u' });
	assert.equal(dir, '/videos/etc');
});

test('sanitizeFilename folds accented Latin letters to plain ASCII', () => {
	assert.equal(sanitizeFilename('BITWA STREAMERÓW'), 'BITWA STREAMEROW');
	assert.equal(sanitizeFilename('zażółć gęślą jaźń'), 'zazolc gesla jazn');
	assert.equal(sanitizeFilename('crème brûlée café'), 'creme brulee cafe');
});

test('sanitizeFilename transliterates letters NFD cannot decompose', () => {
	assert.equal(sanitizeFilename('Łódź'), 'Lodz');
	assert.equal(sanitizeFilename('Straße'), 'Strasse');
	assert.equal(sanitizeFilename('Ærø'), 'AEro');
});

test('sanitizeFilename leaves non-Latin scripts alone', () => {
	// Folding these would destroy the name rather than simplify it.
	assert.equal(sanitizeFilename('Привет мир'), 'Привет мир');
	assert.equal(sanitizeFilename('日本語のタイトル'), '日本語のタイトル');
});
