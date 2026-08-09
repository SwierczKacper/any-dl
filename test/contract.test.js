import assert from 'node:assert/strict';
import test from 'node:test';

import { listingToJson, mediaToJson, SCHEMA_VERSION } from '../src/contract.js';

/** A stand-in provider, so these tests describe the contract and not Kick. */
const provider = {
	key: 'example',
	label: 'Example',
	webUrl: (media) => `https://example.com/${media.channel}/${media.id}`,
};

/** What a provider hands over internally — note the fields that are its own business. */
function sampleMedia(overrides = {}) {
	return {
		kind: 'vod',
		id: 'abc123',
		title: 'A stream',
		channel: 'somebody',
		startTime: '2026-08-07T19:28:32+00:00',
		durationSec: 3600,
		views: 42,
		category: 'Just Chatting',
		masterUrl: 'https://cdn.example.com/master.m3u8',
		directUrl: null,
		...overrides,
	};
}

test('mediaToJson emits exactly the agreed fields', () => {
	const json = mediaToJson(sampleMedia(), provider, {
		selectedQuality: '1080p60',
		sourceUrl: 'https://cdn.example.com/1080p60.m3u8',
		availableQualities: ['1080p60', '720p60'],
	});

	assert.deepEqual(Object.keys(json).sort(), [
		'availableQualities',
		'category',
		'channel',
		'durationSec',
		'id',
		'kind',
		'provider',
		'schemaVersion',
		'selectedQuality',
		'sourceUrl',
		'startTime',
		'title',
		'views',
		'webUrl',
	]);

	assert.equal(json.schemaVersion, SCHEMA_VERSION);
	assert.equal(json.provider, 'example');
	assert.equal(json.id, 'abc123');
	assert.equal(json.webUrl, 'https://example.com/somebody/abc123');
});

test('mediaToJson does not leak a provider internal field', () => {
	// The whole point of building the shape by hand: masterUrl and directUrl are
	// how a provider fetches things, not something callers should read.
	const json = mediaToJson(sampleMedia(), provider, { sourceUrl: 'https://x/y.m3u8' });

	assert.equal('masterUrl' in json, false);
	assert.equal('directUrl' in json, false);
});

test('mediaToJson ignores extra fields a provider invents', () => {
	const json = mediaToJson(sampleMedia({ somethingNew: 'surprise' }), provider, {});

	assert.equal('somethingNew' in json, false);
});

test('mediaToJson fills in for an item with no variants', () => {
	const json = mediaToJson(sampleMedia({ kind: 'clip' }), provider, {});

	assert.equal(json.selectedQuality, null);
	assert.equal(json.sourceUrl, null);
	assert.deepEqual(json.availableQualities, []);
});

test('listingToJson omits the stream URL, which a listing must not fetch', () => {
	const [entry] = listingToJson([sampleMedia()], provider);

	assert.equal('sourceUrl' in entry, false);
	assert.equal('availableQualities' in entry, false);
	assert.equal('selectedQuality' in entry, false);
	assert.equal(entry.webUrl, 'https://example.com/somebody/abc123');
});

test('listingToJson describes every entry on its own', () => {
	const entries = listingToJson([sampleMedia(), sampleMedia({ id: 'def456' })], provider);

	assert.equal(entries.length, 2);
	for (const entry of entries) {
		assert.equal(entry.schemaVersion, SCHEMA_VERSION);
		assert.equal(entry.provider, 'example');
	}
	assert.equal(entries[1].id, 'def456');
});
