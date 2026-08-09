import assert from 'node:assert/strict';
import test from 'node:test';

import * as kick from '../src/providers/kick.js';
import { DEFAULT_PROVIDER, providerByKey, PROVIDERS, providerFor } from '../src/providers/index.js';

test('every provider exposes the interface the CLI relies on', () => {
	for (const provider of PROVIDERS) {
		assert.equal(typeof provider.key, 'string', 'key');
		assert.equal(typeof provider.label, 'string', 'label');
		for (const method of [
			'matchUrl',
			'webUrl',
			'parseTarget',
			'getVideo',
			'getClip',
			'getChannelVods',
			'getChannelClips',
		]) {
			assert.equal(typeof provider[method], 'function', `${provider.key}.${method}`);
		}
	}
});

test('a link is routed by its hostname', () => {
	assert.equal(providerFor('https://kick.com/xmerghani/videos/abc').key, 'kick');
	assert.equal(providerFor('https://www.kick.com/xmerghani').key, 'kick');
});

test('a bare channel name goes to the default provider', () => {
	// Nothing in "xmerghani" says which site it belongs to, so it cannot be
	// routed by inspection — the default decides until --provider exists.
	assert.equal(providerFor('xmerghani'), DEFAULT_PROVIDER);
	assert.equal(providerFor('clip_01ABCDEF'), DEFAULT_PROVIDER);
});

test('a link to an unsupported site is refused by name', () => {
	assert.throws(() => providerFor('https://www.youtube.com/watch?v=abc'), /youtube\.com/i);
});

test('an unparseable URL is refused as such', () => {
	assert.throws(() => providerFor('https://'), /not a valid url/i);
});

test('empty input is refused', () => {
	assert.throws(() => providerFor('   '), /no channel or link/i);
});

test('providerByKey finds a provider, or returns null', () => {
	assert.equal(providerByKey('kick'), kick);
	assert.equal(providerByKey('nope'), null);
});

test('kick.matchUrl accepts its own domain and nothing else', () => {
	assert.equal(kick.matchUrl(new URL('https://kick.com/a')), true);
	assert.equal(kick.matchUrl(new URL('https://www.kick.com/a')), true);
	assert.equal(kick.matchUrl(new URL('https://notkick.com/a')), false);
	assert.equal(kick.matchUrl(new URL('https://kick.com.evil.test/a')), false);
});

test('kick.webUrl builds the page a viewer would open', () => {
	assert.equal(
		kick.webUrl({ kind: 'vod', channel: 'xmerghani', id: '019fdd44' }),
		'https://kick.com/xmerghani/videos/019fdd44'
	);
	assert.equal(
		kick.webUrl({ kind: 'clip', channel: 'xmerghani', id: 'clip_01ABC' }),
		'https://kick.com/xmerghani?clip=clip_01ABC'
	);
});
