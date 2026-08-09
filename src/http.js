import { UserFacingError } from './util.js';

/**
 * Plain HTTP, for everything that does not need a browser.
 *
 * Kick sits behind Cloudflare and has to be read by driving a real Chrome —
 * that is `browser.js`, and it is a heavy, fragile thing to depend on. Most of
 * what this tool fetches is not like that: CDN playlists answer anyone, and
 * some sites hand out an ordinary API. Keeping the two apart means a provider
 * that needs no browser never drags one in.
 */

// A real browser's user-agent, because plenty of CDNs and APIs quietly treat an
// unfamiliar one as a bot. Deliberately free of "HeadlessChrome", which
// Cloudflare rejects outright — browser.js reuses this for the same reason.
export const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 30_000;

function hostOf(url) {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

/**
 * One request, with the failure modes turned into messages a user can act on.
 *
 * A non-2xx response throws, carrying `status` so a caller that knows what a
 * particular code means there — a site's own "this is subscriber-only" — can
 * say so instead of leaving the bare number.
 */
async function request(url, { method = 'GET', body, headers = {}, timeout = DEFAULT_TIMEOUT_MS, hint } = {}) {
	let response;
	try {
		response = await fetch(url, {
			method,
			body,
			headers: { 'User-Agent': USER_AGENT, ...headers },
			signal: AbortSignal.timeout(timeout),
		});
	} catch (err) {
		if (err.name === 'TimeoutError') {
			throw new UserFacingError(`${hostOf(url)} did not respond within ${timeout / 1000}s.`);
		}
		throw new UserFacingError(`Could not reach ${hostOf(url)}: ${err.message}`);
	}

	if (!response.ok) {
		const error = new UserFacingError(`${hostOf(url)} returned HTTP ${response.status}.`, hint);
		error.status = response.status;
		throw error;
	}

	return response;
}

export async function getText(url, options) {
	return (await request(url, options)).text();
}

async function readJson(response, url) {
	try {
		return await response.json();
	} catch {
		throw new UserFacingError(`${hostOf(url)} did not return JSON.`);
	}
}

export async function getJson(url, options) {
	return readJson(await request(url, options), url);
}

export async function postJson(url, payload, options = {}) {
	const response = await request(url, {
		...options,
		method: 'POST',
		body: JSON.stringify(payload),
		// Not application/json: some APIs treat that as a cross-origin request
		// worth a preflight and answer differently. text/plain is what a browser
		// sends them, so it is what gets the expected response.
		headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...options.headers },
	});

	return readJson(response, url);
}
