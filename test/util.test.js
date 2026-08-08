import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	isUuid,
	parseKickDate,
	parseTimecode,
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
