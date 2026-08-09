import assert from 'node:assert/strict';
import test from 'node:test';

import * as kick from '../src/providers/kick.js';
import {
	DEFAULT_PROVIDER,
	providerByKey,
	PROVIDERS,
	providerFor,
	resolveProvider,
} from '../src/providers/index.js';

/**
 * Two stand-in sites, so the paths that only matter once a second provider
 * exists can be exercised today rather than on the day one is added.
 */
const alpha = { key: 'alpha', label: 'Alpha', matchUrl: (url) => url.hostname === 'alpha.test' };
const beta = { key: 'beta', label: 'Beta', matchUrl: (url) => url.hostname === 'beta.test' };
const two = [alpha, beta];

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

test('a link decides on its own, whatever else was passed', async () => {
	assert.equal(await resolveProvider({ target: 'https://beta.test/x', providers: two }), beta);
	assert.equal(
		await resolveProvider({ target: 'https://alpha.test/x', env: 'beta', providers: two }),
		alpha
	);
});

test('a link that contradicts the named site is refused', async () => {
	await assert.rejects(
		() => resolveProvider({ target: 'https://alpha.test/x', provider: 'beta', providers: two }),
		/is a Alpha link, but beta was given/i
	);
});

test('an explicitly named site wins over the environment', async () => {
	assert.equal(await resolveProvider({ target: 'somebody', provider: 'beta', env: 'alpha', providers: two }), beta);
	assert.equal(await resolveProvider({ target: 'somebody', env: 'beta', providers: two }), beta);
});

test('an unknown site is refused, listing the known ones', async () => {
	await assert.rejects(
		() => resolveProvider({ target: 'somebody', provider: 'nope', providers: two }),
		/unknown site: nope/i
	);
});

test('with one site there is nothing to ask', async () => {
	let asked = false;
	const chooseSite = () => {
		asked = true;
		return alpha;
	};

	assert.equal(await resolveProvider({ target: 'somebody', chooseSite, providers: [alpha] }), alpha);
	assert.equal(asked, false, 'should not have prompted');
});

test('an ambiguous name is put to the picker when one is available', async () => {
	const offered = [];
	const chooseSite = (providers) => {
		offered.push(...providers);
		return beta;
	};

	assert.equal(await resolveProvider({ target: 'somebody', chooseSite, providers: two }), beta);
	assert.deepEqual(offered, two);
});

test('an ambiguous name without a terminal fails rather than guessing', async () => {
	await assert.rejects(
		() => resolveProvider({ target: 'somebody', chooseSite: null, providers: two }),
		/could be a channel on any of the supported sites/i
	);
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
