import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../src/args.js';

test('parseArgs defaults to the best quality and the current directory', () => {
	const options = parseArgs(['xmerghani']);
	assert.equal(options.target, 'xmerghani');
	assert.equal(options.quality, 'best');
	assert.equal(options.dir, null);
	assert.equal(options.channelDir, false);
	assert.equal(options.yes, false);
	assert.equal(options.progress, true);
});

test('parseArgs accepts short and long option names', () => {
	assert.equal(parseArgs(['x', '-q', '720p60']).quality, '720p60');
	assert.equal(parseArgs(['x', '--quality', '720p60']).quality, '720p60');
});

test('parseArgs accepts --key=value', () => {
	assert.equal(parseArgs(['x', '--quality=1080p60']).quality, '1080p60');
	assert.equal(parseArgs(['x', '--output=clip.mp4']).output, 'clip.mp4');
});

test('parseArgs handles flags', () => {
	const options = parseArgs(['x', '--clips', '--yes', '--json', '--no-progress', '--faststart', '--channel-dir']);
	assert.equal(options.clips, true);
	assert.equal(options.yes, true);
	assert.equal(options.json, true);
	assert.equal(options.progress, false);
	assert.equal(options.faststart, true);
	assert.equal(options.channelDir, true);
});

test('parseArgs keeps the timecodes as given for later validation', () => {
	const options = parseArgs(['x', '--from', '01:00:00', '--to', '01:15:00']);
	assert.equal(options.from, '01:00:00');
	assert.equal(options.to, '01:15:00');
});

test('parseArgs validates --limit', () => {
	assert.equal(parseArgs(['x', '-n', '5']).limit, 5);
	assert.throws(() => parseArgs(['x', '-n', '0']), /positive integer/);
	assert.throws(() => parseArgs(['x', '-n', 'abc']), /positive integer/);
});

test('parseArgs rejects an unknown option', () => {
	assert.throws(() => parseArgs(['x', '--bogus']), /Unknown option/);
});

test('parseArgs rejects an option that is missing its value', () => {
	assert.throws(() => parseArgs(['x', '--quality']), /needs a value/);
});

test('parseArgs rejects a second positional argument', () => {
	assert.throws(() => parseArgs(['one', 'two']), /Unexpected extra argument/);
});

test('parseArgs allows no target at all', () => {
	assert.equal(parseArgs([]).target, null);
	assert.equal(parseArgs(['--help']).help, true);
	assert.equal(parseArgs(['-v']).version, true);
});
