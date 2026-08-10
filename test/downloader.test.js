import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { downloadSegments } from '../src/downloader.js';

/**
 * Served from a local server rather than a stubbed fetch: ordering, retries and
 * resuming are all about what really happens over a socket, and a stub that
 * resolves immediately would hide the very interleaving these tests are for.
 * Nothing here leaves the machine.
 */
async function withServer(handler, run) {
	const requests = [];
	const server = createServer((request, response) => {
		requests.push(request.url);
		handler(request, response, requests);
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	const directory = await mkdtemp(join(tmpdir(), 'any-dl-test-'));

	try {
		return await run({ base, directory, requests });
	} finally {
		await new Promise((resolve) => server.close(resolve));
		await rm(directory, { recursive: true, force: true });
	}
}

/** Segment n is a buffer of `n` repeated, so the written order is readable. */
function makeSegments(base, count) {
	return Array.from({ length: count }, (_, index) => ({
		index,
		url: `${base}/${index}.ts`,
		seconds: 10,
		start: index * 10,
	}));
}

function bodyFor(index) {
	return Buffer.alloc(64, String(index % 10));
}

test('downloadSegments writes segments in order despite fetching them at once', async () => {
	await withServer(
		(request, response) => {
			const index = Number(request.url.match(/(\d+)\.ts/)[1]);
			// Earlier segments answer slowest, so anything writing on arrival rather
			// than in order would produce a scrambled file.
			setTimeout(() => response.end(bodyFor(index)), (12 - index) * 8);
		},
		async ({ base, directory }) => {
			const target = join(directory, 'out.ts');
			const segments = makeSegments(base, 12);

			const result = await downloadSegments({ segments, target, concurrency: 6 });

			const written = await readFile(target);
			const expected = Buffer.concat(segments.map((segment) => bodyFor(segment.index)));
			assert.deepEqual(written, expected);
			assert.equal(result.completed, 12);
			assert.equal(result.bytes, expected.length);
			assert.equal(result.seconds, 120);
			assert.equal(result.interrupted, false);
		}
	);
});

test('downloadSegments retries a segment that fails, without losing its place', async () => {
	let failures = 0;
	await withServer(
		(request, response) => {
			const index = Number(request.url.match(/(\d+)\.ts/)[1]);
			if (index === 2 && failures < 2) {
				failures += 1;
				response.statusCode = 500;
				response.end('nope');
				return;
			}
			response.end(bodyFor(index));
		},
		async ({ base, directory }) => {
			const target = join(directory, 'out.ts');
			const segments = makeSegments(base, 5);

			const result = await downloadSegments({ segments, target, concurrency: 3 });

			assert.equal(failures, 2);
			assert.equal(result.completed, 5);
			assert.deepEqual(await readFile(target), Buffer.concat(segments.map((s) => bodyFor(s.index))));
		}
	);
});

test('downloadSegments does not count bytes from an attempt it threw away', async () => {
	let dropped = false;
	await withServer(
		(request, response) => {
			const index = Number(request.url.match(/(\d+)\.ts/)[1]);
			if (index === 1 && !dropped) {
				// Half a segment, then the connection dies — the retry must not leave
				// those bytes on the total, or progress overshoots the real size.
				dropped = true;
				response.write(Buffer.alloc(32, '1'));
				response.socket.destroy();
				return;
			}
			response.end(bodyFor(index));
		},
		async ({ base, directory }) => {
			const target = join(directory, 'out.ts');
			const segments = makeSegments(base, 3);
			const updates = [];

			const result = await downloadSegments({
				segments,
				target,
				concurrency: 1,
				onProgress: (stats) => updates.push(stats),
			});

			assert.equal(dropped, true);
			assert.equal(result.bytes, 192);
			// The reported total ends where the file does, despite the abandoned half.
			assert.equal(updates.at(-1).bytes, 192);
		}
	);
});

test('downloadSegments leaves a resumable partial when a segment cannot be fetched', async () => {
	await withServer(
		(request, response) => {
			const index = Number(request.url.match(/(\d+)\.ts/)[1]);
			if (index === 3) {
				response.statusCode = 404;
				response.end('gone');
				return;
			}
			response.end(bodyFor(index));
		},
		async ({ base, directory }) => {
			const target = join(directory, 'out.ts');
			const segments = makeSegments(base, 6);

			await assert.rejects(
				() => downloadSegments({ segments, target, concurrency: 2 }),
				/Could not fetch part 4 of 6/
			);

			// Everything before the failure is on disk, and the state names it.
			const state = JSON.parse(await readFile(`${target}.state`, 'utf8'));
			assert.equal(state.completed, 3);
			assert.equal((await stat(target)).size, state.bytes);
		}
	);
});

test('downloadSegments resumes where it stopped instead of starting again', async () => {
	await withServer(
		(request, response) => {
			const index = Number(request.url.match(/(\d+)\.ts/)[1]);
			response.end(bodyFor(index));
		},
		async ({ base, directory, requests }) => {
			const target = join(directory, 'out.ts');
			const segments = makeSegments(base, 8);

			// Stand in for an interrupted run: the first three segments, and a state
			// file describing exactly them.
			const partial = Buffer.concat([0, 1, 2].map(bodyFor));
			await writeFile(target, partial);
			await writeFile(
				`${target}.state`,
				JSON.stringify({
					version: 1,
					signature: `8:80:/0.ts`,
					completed: 3,
					bytes: partial.length,
					seconds: 30,
				})
			);

			const result = await downloadSegments({ segments, target, totalSeconds: 80, concurrency: 4 });

			assert.equal(result.resumedFrom, 3);
			assert.deepEqual(requests.sort(), ['/3.ts', '/4.ts', '/5.ts', '/6.ts', '/7.ts']);
			assert.deepEqual(await readFile(target), Buffer.concat(segments.map((s) => bodyFor(s.index))));
			assert.equal(result.seconds, 80);
		}
	);
});

test('downloadSegments starts over when the partial belongs to a different video', async () => {
	await withServer(
		(request, response) => {
			const index = Number(request.url.match(/(\d+)\.ts/)[1]);
			response.end(bodyFor(index));
		},
		async ({ base, directory, requests }) => {
			const target = join(directory, 'out.ts');
			const segments = makeSegments(base, 4);

			await writeFile(target, Buffer.alloc(999, 'x'));
			await writeFile(
				`${target}.state`,
				JSON.stringify({ version: 1, signature: 'something-else', completed: 2, bytes: 999, seconds: 20 })
			);

			const result = await downloadSegments({ segments, target, concurrency: 2 });

			assert.equal(result.resumedFrom, 0);
			assert.equal(requests.length, 4);
			assert.deepEqual(await readFile(target), Buffer.concat(segments.map((s) => bodyFor(s.index))));
		}
	);
});

test('downloadSegments truncates a partial that ran ahead of its recorded state', async () => {
	await withServer(
		(request, response) => {
			const index = Number(request.url.match(/(\d+)\.ts/)[1]);
			response.end(bodyFor(index));
		},
		async ({ base, directory }) => {
			const target = join(directory, 'out.ts');
			const segments = makeSegments(base, 4);
			const clean = Buffer.concat([0, 1].map(bodyFor));

			// A crash between writing data and recording it: the file holds part of a
			// third segment the state does not know about.
			await writeFile(target, Buffer.concat([clean, Buffer.alloc(20, 'z')]));
			await writeFile(
				`${target}.state`,
				JSON.stringify({ version: 1, signature: '4:40:/0.ts', completed: 2, bytes: clean.length, seconds: 20 })
			);

			await downloadSegments({ segments, target, totalSeconds: 40, concurrency: 2 });

			assert.deepEqual(await readFile(target), Buffer.concat(segments.map((s) => bodyFor(s.index))));
		}
	);
});

test('downloadSegments clears the state file once everything is written', async () => {
	await withServer(
		(request, response) => {
			const index = Number(request.url.match(/(\d+)\.ts/)[1]);
			response.end(bodyFor(index));
		},
		async ({ base, directory }) => {
			const target = join(directory, 'out.ts');
			await downloadSegments({ segments: makeSegments(base, 3), target, concurrency: 2 });

			await assert.rejects(() => stat(`${target}.state`), { code: 'ENOENT' });
		}
	);
});

test('downloadSegments reports progress that grows monotonically', async () => {
	await withServer(
		(request, response) => {
			const index = Number(request.url.match(/(\d+)\.ts/)[1]);
			setTimeout(() => response.end(bodyFor(index)), (8 - index) * 5);
		},
		async ({ base, directory }) => {
			const target = join(directory, 'out.ts');
			const updates = [];

			await downloadSegments({
				segments: makeSegments(base, 8),
				target,
				concurrency: 4,
				onProgress: (stats) => updates.push(stats),
			});

			// At least one update per segment, and more than that while a segment is
			// still arriving — a ten-second segment on a slow line must not leave the
			// display frozen until it lands.
			assert.ok(updates.length >= 8, `expected frequent updates, got ${updates.length}`);

			for (let i = 1; i < updates.length; i += 1) {
				assert.ok(updates[i].seconds >= updates[i - 1].seconds, 'seconds must not go backwards');
				assert.ok(updates[i].bytes >= updates[i - 1].bytes, 'bytes must not go backwards');
			}

			assert.equal(updates.at(-1).seconds, 80);
			assert.equal(updates.at(-1).ratio, 1);
		}
	);
});
