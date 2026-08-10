import assert from 'node:assert/strict';
import test from 'node:test';

import { clipVariants, matchUrl, parseTarget, webUrl } from '../src/providers/twitch.js';

test('parseTarget reads a VOD link', () => {
	assert.deepEqual(parseTarget('https://www.twitch.tv/videos/2832871456'), {
		type: 'video',
		id: '2832871456',
	});
});

test('parseTarget reads the older per-channel VOD links', () => {
	assert.deepEqual(parseTarget('https://www.twitch.tv/somechannel/v/2832871456'), {
		type: 'video',
		id: '2832871456',
	});
	assert.deepEqual(parseTarget('https://www.twitch.tv/somechannel/video/2832871456'), {
		type: 'video',
		id: '2832871456',
	});
});

test('parseTarget reads a player link, whose ids carry a v prefix', () => {
	assert.deepEqual(parseTarget('https://player.twitch.tv/?video=v2832871456&parent=example.com'), {
		type: 'video',
		id: '2832871456',
	});
});

test('parseTarget accepts every host Twitch answers on', () => {
	for (const host of ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'go.twitch.tv']) {
		assert.deepEqual(parseTarget(`https://${host}/videos/2832871456`), { type: 'video', id: '2832871456' });
	}
});

test('parseTarget reads a clip on its own domain', () => {
	assert.deepEqual(parseTarget('https://clips.twitch.tv/SomeSlugMadeOfWords-aBcD1234'), {
		type: 'clip',
		id: 'SomeSlugMadeOfWords-aBcD1234',
	});
});

test('parseTarget reads an embedded clip', () => {
	assert.deepEqual(parseTarget('https://clips.twitch.tv/embed?clip=SomeSlugMadeOfWords-aBcD1234&parent=x.com'), {
		type: 'clip',
		id: 'SomeSlugMadeOfWords-aBcD1234',
	});
});

test('parseTarget reads a clip under a channel', () => {
	assert.deepEqual(parseTarget('https://www.twitch.tv/somechannel/clip/SomeSlugMadeOfWords-aBcD1234'), {
		type: 'clip',
		id: 'SomeSlugMadeOfWords-aBcD1234',
		channel: 'somechannel',
	});
});

test('parseTarget reads a channel page, and its tabs', () => {
	for (const path of ['', '/videos', '/clips', '/about']) {
		assert.deepEqual(parseTarget(`https://www.twitch.tv/somechannel${path}`), {
			type: 'channel',
			channel: 'somechannel',
		});
	}
});

test('parseTarget lowercases a channel, since a login is case-insensitive', () => {
	assert.deepEqual(parseTarget('https://www.twitch.tv/SomeChannel'), { type: 'channel', channel: 'somechannel' });
	assert.deepEqual(parseTarget('SomeChannel'), { type: 'channel', channel: 'somechannel' });
});

test('parseTarget reads a bare channel name, with or without an @', () => {
	assert.deepEqual(parseTarget('somechannel'), { type: 'channel', channel: 'somechannel' });
	assert.deepEqual(parseTarget('@somechannel'), { type: 'channel', channel: 'somechannel' });
});

test('parseTarget reads a bare video id', () => {
	assert.deepEqual(parseTarget('2832871456'), { type: 'video', id: '2832871456' });
	assert.deepEqual(parseTarget('v2832871456'), { type: 'video', id: '2832871456' });
});

test('parseTarget takes a bare clip slug for what it is', () => {
	// Longer than a login may be, so it cannot be a channel.
	assert.deepEqual(parseTarget('SomeVeryLongSlugMadeOfSeveralWords-aBcD1234'), {
		type: 'clip',
		id: 'SomeVeryLongSlugMadeOfSeveralWords-aBcD1234',
	});
});

test('parseTarget refuses a link to another site', () => {
	assert.throws(() => parseTarget('https://kick.com/somechannel'), /Not a twitch\.tv link/);
});

test('parseTarget refuses input that is neither a link nor a name', () => {
	assert.throws(() => parseTarget('not a channel!'), /neither a valid Twitch link nor a channel name/);
	assert.throws(() => parseTarget('   '), /No channel or link given/);
});

test('parseTarget refuses a link it cannot place', () => {
	assert.throws(() => parseTarget('https://www.twitch.tv/directory/game/Just%20Chatting/clips'), /Could not tell/);
});

test('matchUrl accepts twitch.tv and its subdomains, and nothing else', () => {
	assert.ok(matchUrl(new URL('https://twitch.tv/x')));
	assert.ok(matchUrl(new URL('https://www.twitch.tv/x')));
	assert.ok(matchUrl(new URL('https://clips.twitch.tv/x')));
	assert.ok(!matchUrl(new URL('https://kick.com/x')));
	// The trick this guards against: a hostname that merely ends in the name.
	assert.ok(!matchUrl(new URL('https://nottwitch.tv/x')));
	assert.ok(!matchUrl(new URL('https://twitch.tv.example.com/x')));
});

test('webUrl builds the page a viewer would open', () => {
	assert.equal(
		webUrl({ kind: 'vod', id: '2832871456', channel: 'somechannel' }),
		'https://www.twitch.tv/videos/2832871456'
	);
	assert.equal(
		webUrl({ kind: 'clip', id: 'SomeSlug-aBcD', channel: 'somechannel' }),
		'https://www.twitch.tv/somechannel/clip/SomeSlug-aBcD'
	);
});

const CLIP_WITH_QUALITIES = {
	playbackAccessToken: { value: 'TOKEN', signature: 'SIG' },
	videoQualities: [
		{ quality: '480', frameRate: 30, sourceURL: 'https://cdn.example.net/clip/480/index.mp4' },
		{ quality: '1080', frameRate: 59.866, sourceURL: 'https://cdn.example.net/clip/1080/index.mp4' },
		{ quality: '720', frameRate: 0, sourceURL: 'https://cdn.example.net/clip/720/index.mp4' },
	],
};

test('clipVariants orders a clip tallest first', () => {
	const variants = clipVariants(CLIP_WITH_QUALITIES);
	assert.deepEqual(
		variants.map((variant) => variant.height),
		[1080, 720, 480]
	);
});

test('clipVariants names a size the way --quality is written', () => {
	const [best, middle, worst] = clipVariants(CLIP_WITH_QUALITIES);
	// 59.866 is what Twitch really reports; nobody types "1080p59.866".
	assert.equal(best.name, '1080p60');
	// A frame rate of 0 means "not stated", not zero frames a second.
	assert.equal(middle.name, '720p');
	assert.equal(worst.name, '480p30');
});

test('clipVariants signs every URL', () => {
	for (const variant of clipVariants(CLIP_WITH_QUALITIES)) {
		const url = new URL(variant.url);
		assert.equal(url.searchParams.get('sig'), 'SIG');
		assert.equal(url.searchParams.get('token'), 'TOKEN');
	}
});

test('clipVariants leaves width and bitrate unknown rather than inventing them', () => {
	// Twitch states neither, and a guessed bitrate would drive a size estimate
	// and a disk-space warning that were never measured.
	const [best] = clipVariants(CLIP_WITH_QUALITIES);
	assert.equal(best.width, null);
	assert.equal(best.bandwidth, 0);
});

test('clipVariants skips an entry with nothing to download', () => {
	const variants = clipVariants({
		videoQualities: [{ quality: '1080', sourceURL: null }, ...CLIP_WITH_QUALITIES.videoQualities],
	});
	assert.equal(variants.length, 3);
});

test('clipVariants copes with a clip that has no qualities at all', () => {
	assert.deepEqual(clipVariants({}), []);
});
