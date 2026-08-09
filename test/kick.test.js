import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTarget } from '../src/providers/kick.js';

test('parseTarget reads a channel VOD link', () => {
	assert.deepEqual(parseTarget('https://kick.com/xmerghani/videos/019fdd44-f600-7184-bf35-ff795a9b372c'), {
		type: 'video',
		id: '019fdd44-f600-7184-bf35-ff795a9b372c',
		channel: 'xmerghani',
	});
});

test('parseTarget reads a channel-less VOD link', () => {
	assert.deepEqual(parseTarget('https://kick.com/video/d3498feb-7e9a-413e-a5b0-f006f3b2c902'), {
		type: 'video',
		id: 'd3498feb-7e9a-413e-a5b0-f006f3b2c902',
		channel: undefined,
	});
});

test('parseTarget reads a clip given as a query parameter', () => {
	assert.deepEqual(parseTarget('https://kick.com/xmerghani?clip=clip_01ABCDEF'), {
		type: 'clip',
		id: 'clip_01ABCDEF',
	});
});

test('parseTarget reads a clip given as a path', () => {
	assert.deepEqual(parseTarget('https://kick.com/xmerghani/clips/clip_01ABCDEF'), {
		type: 'clip',
		id: 'clip_01ABCDEF',
		channel: 'xmerghani',
	});
});

test('parseTarget reads a bare channel link', () => {
	assert.deepEqual(parseTarget('https://kick.com/xmerghani'), { type: 'channel', channel: 'xmerghani' });
});

test('parseTarget accepts www and trailing slashes', () => {
	assert.deepEqual(parseTarget('https://www.kick.com/xmerghani/'), { type: 'channel', channel: 'xmerghani' });
});

test('parseTarget accepts a bare channel name', () => {
	assert.deepEqual(parseTarget('xmerghani'), { type: 'channel', channel: 'xmerghani' });
	assert.deepEqual(parseTarget('@xmerghani'), { type: 'channel', channel: 'xmerghani' });
});

test('parseTarget accepts a bare uuid', () => {
	assert.deepEqual(parseTarget('d3498feb-7e9a-413e-a5b0-f006f3b2c902'), {
		type: 'video',
		id: 'd3498feb-7e9a-413e-a5b0-f006f3b2c902',
	});
});

test('parseTarget accepts a bare clip id', () => {
	assert.deepEqual(parseTarget('clip_01ABCDEF'), { type: 'clip', id: 'clip_01ABCDEF' });
});

test('parseTarget rejects links to other sites', () => {
	assert.throws(() => parseTarget('https://youtube.com/watch?v=abc'), /Not a kick\.com link/);
	// A lookalike domain must not slip through the hostname check.
	assert.throws(() => parseTarget('https://notkick.com/someone'), /Not a kick\.com link/);
});

test('parseTarget rejects empty and malformed input', () => {
	assert.throws(() => parseTarget(''), /No channel or link given/);
	assert.throws(() => parseTarget('   '), /No channel or link given/);
	assert.throws(() => parseTarget('some channel name'), /neither a valid Kick link nor a channel name/);
});
