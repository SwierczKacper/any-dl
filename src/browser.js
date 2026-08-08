import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { UserFacingError } from './util.js';

// Kick sits behind Cloudflare, which rejects plain HTTP clients (and any UA
// containing "HeadlessChrome"). Driving a real Chrome with --dump-dom gets us
// the JSON without a single npm dependency.
const USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Persisted so Cloudflare's clearance cookie survives between invocations.
const PROFILE_DIR = join(tmpdir(), 'kick-vod-chrome-profile');

const LINUX_CANDIDATES = [
	'/usr/bin/google-chrome',
	'/usr/bin/google-chrome-stable',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
	'/snap/bin/chromium',
	'/usr/bin/brave-browser',
	'/usr/bin/microsoft-edge',
];

const MAC_CANDIDATES = [
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	'/Applications/Chromium.app/Contents/MacOS/Chromium',
	'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
	'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const WINDOWS_CANDIDATES = [
	'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

/** Chrome builds that Puppeteer may have already downloaded into its cache. */
function puppeteerCacheCandidates() {
	const cacheRoot = join(homedir(), '.cache', 'puppeteer', 'chrome');
	if (!existsSync(cacheRoot)) return [];

	const platformSubpaths = {
		linux: ['chrome-linux64', 'chrome'],
		darwin: ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
		win32: ['chrome-win64', 'chrome.exe'],
	}[process.platform];
	if (!platformSubpaths) return [];

	try {
		return readdirSync(cacheRoot)
			.sort()
			.reverse() // newest version first
			.map((version) => join(cacheRoot, version, ...platformSubpaths));
	} catch {
		return [];
	}
}

let cachedChromePath;

export function findChrome() {
	if (cachedChromePath !== undefined) return cachedChromePath;

	const fromEnv =
		process.env.KICK_CHROME_PATH ||
		process.env.CHROME_PATH ||
		process.env.PUPPETEER_EXECUTABLE_PATH;

	if (fromEnv) {
		if (!existsSync(fromEnv)) {
			throw new UserFacingError(
				`Chrome not found at the configured path: ${fromEnv}`,
				'Fix CHROME_PATH / KICK_CHROME_PATH, or unset it to use auto-detection.'
			);
		}
		cachedChromePath = fromEnv;
		return cachedChromePath;
	}

	const candidates = {
		linux: LINUX_CANDIDATES,
		darwin: MAC_CANDIDATES,
		win32: WINDOWS_CANDIDATES,
	}[process.platform] ?? [];

	cachedChromePath =
		[...candidates, ...puppeteerCacheCandidates()].find((path) => existsSync(path)) ?? null;

	return cachedChromePath;
}

function requireChrome() {
	const chromePath = findChrome();
	if (chromePath) return chromePath;

	throw new UserFacingError(
		'No Chrome/Chromium installation found.',
		[
			'Kick is behind Cloudflare, so a real browser is needed to read its API.',
			'Install one, e.g.  sudo apt install chromium-browser',
			'or download a private copy:  npx @puppeteer/browsers install chrome@stable',
			'then point the tool at it:  export CHROME_PATH=/path/to/chrome',
		].join('\n  ')
	);
}

const HTML_ENTITIES = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&#39;': "'",
	'&#x27;': "'",
	'&nbsp;': ' ',
};

function decodeEntities(html) {
	return html.replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27);/g, (match) => HTML_ENTITIES[match] ?? match);
}

function runChrome(chromePath, url, { timeout, sandbox }) {
	const args = [
		'--headless=new',
		'--disable-gpu',
		'--disable-dev-shm-usage',
		'--disable-extensions',
		'--disable-background-networking',
		'--no-first-run',
		'--no-default-browser-check',
		'--mute-audio',
		`--user-agent=${USER_AGENT}`,
		`--user-data-dir=${PROFILE_DIR}`,
		'--dump-dom',
		url,
	];
	if (!sandbox) args.unshift('--no-sandbox');

	return new Promise((resolve, reject) => {
		const child = spawn(chromePath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

		let stdout = '';
		let stderr = '';
		let timedOut = false;

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, timeout);

		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});

		child.on('error', (err) => {
			clearTimeout(timer);
			reject(new UserFacingError(`Could not launch Chrome (${chromePath}): ${err.message}`));
		});

		child.on('close', (code) => {
			clearTimeout(timer);
			if (timedOut) {
				reject(new UserFacingError(`Chrome timed out after ${timeout / 1000}s while loading the Kick API.`));
				return;
			}
			resolve({ code, stdout, stderr });
		});
	});
}

/**
 * Load a Kick API endpoint through Chrome and return the parsed JSON body.
 */
export async function fetchJson(url, { timeout = 60_000 } = {}) {
	const chromePath = requireChrome();

	let result = await runChrome(chromePath, url, { timeout, sandbox: true });

	// Containers and root shells need the sandbox disabled; retry once.
	if (result.code !== 0 && /sandbox/i.test(result.stderr)) {
		result = await runChrome(chromePath, url, { timeout, sandbox: false });
	}

	if (result.code !== 0 && !result.stdout) {
		const detail = result.stderr.trim().split('\n').slice(-3).join('\n  ');
		throw new UserFacingError(`Chrome exited with code ${result.code}.`, detail || undefined);
	}

	const match = result.stdout.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
	if (!match) {
		throw new UserFacingError(
			'The Kick API did not return JSON.',
			'Cloudflare most likely served a challenge page. Wait a moment and retry.'
		);
	}

	let payload;
	try {
		payload = JSON.parse(decodeEntities(match[1]));
	} catch {
		throw new UserFacingError('Could not parse the Kick API response as JSON.');
	}

	if (payload && typeof payload === 'object' && payload.error && !payload.id) {
		throw new UserFacingError(`Kick API rejected the request: ${payload.error}`);
	}

	return payload;
}
