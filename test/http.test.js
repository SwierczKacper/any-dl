import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { getJson, getText, postJson, USER_AGENT } from '../src/http.js';

/**
 * A throwaway server on loopback. Nothing here touches the network in the sense
 * that matters — no test may contact a real site — but the failure modes worth
 * covering (a bad status, a body that is not JSON, a request that never
 * answers) only exist over a real socket.
 */
async function withServer(handler, run) {
	const server = createServer(handler);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${server.address().port}`;

	try {
		return await run(base);
	} finally {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	}
}

test('getText returns the body', async () => {
	const text = await withServer(
		(req, res) => res.end('#EXTM3U\n'),
		(base) => getText(`${base}/master.m3u8`)
	);
	assert.equal(text, '#EXTM3U\n');
});

test('requests carry a browser user-agent', async () => {
	const seen = await withServer(
		(req, res) => res.end(req.headers['user-agent']),
		(base) => getText(base)
	);
	assert.equal(seen, USER_AGENT);
	// The one thing this string must never say: Cloudflare rejects it outright.
	assert.doesNotMatch(seen, /HeadlessChrome/);
});

test('a failed status becomes a user-facing error carrying the code', async () => {
	await withServer(
		(req, res) => {
			res.statusCode = 403;
			res.end('nope');
		},
		async (base) => {
			const error = await getText(base).then(
				() => null,
				(err) => err
			);
			assert.match(error.message, /HTTP 403/);
			assert.equal(error.status, 403);
			assert.equal(error.name, 'UserFacingError');
		}
	);
});

test('a hint is passed through to the failure', async () => {
	await withServer(
		(req, res) => {
			res.statusCode = 404;
			res.end('gone');
		},
		async (base) => {
			const error = await getText(base, { hint: 'It was probably pruned.' }).then(
				() => null,
				(err) => err
			);
			assert.equal(error.hint, 'It was probably pruned.');
		}
	);
});

test('getJson parses the body', async () => {
	const data = await withServer(
		(req, res) => res.end('{"ok":true}'),
		(base) => getJson(base)
	);
	assert.deepEqual(data, { ok: true });
});

test('a body that is not JSON says so rather than throwing a parse error', async () => {
	await withServer(
		(req, res) => res.end('<html>challenge</html>'),
		async (base) => {
			await assert.rejects(getJson(base), /did not return JSON/);
		}
	);
});

test('postJson sends the payload as a text/plain body', async () => {
	const echoed = await withServer(
		(req, res) => {
			let body = '';
			req.on('data', (chunk) => {
				body += chunk;
			});
			req.on('end', () => res.end(JSON.stringify({ method: req.method, type: req.headers['content-type'], body })));
		},
		(base) => postJson(base, { query: '{ me }' })
	);

	assert.equal(echoed.method, 'POST');
	assert.equal(echoed.type, 'text/plain;charset=UTF-8');
	assert.deepEqual(JSON.parse(echoed.body), { query: '{ me }' });
});

test('extra headers reach the server', async () => {
	const seen = await withServer(
		(req, res) => res.end(JSON.stringify({ id: req.headers['client-id'] ?? null })),
		(base) => postJson(base, {}, { headers: { 'Client-ID': 'abc123' } })
	);
	assert.equal(seen.id, 'abc123');
});

test('a server that never answers times out instead of hanging', async () => {
	await withServer(
		() => {
			// Deliberately no response.
		},
		async (base) => {
			await assert.rejects(getText(base, { timeout: 150 }), /did not respond within/);
		}
	);
});

test('an unreachable host is reported by name', async () => {
	// Port 1 on loopback: nothing listens there, so the connection is refused
	// immediately rather than waiting for a timeout.
	await assert.rejects(getText('http://127.0.0.1:1/'), /Could not reach 127\.0\.0\.1/);
});
