import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Choosing a site only engages when stdin and stderr are TTYs, so a plain pipe
// would skip exactly the code under test. script(1) gives us a real pty.
const HAS_PTY =
	process.platform === 'linux' && spawnSync('script', ['--version'], { stdio: 'ignore' }).status === 0;
const SKIP = HAS_PTY ? false : 'requires a Linux pty via script(1)';

/**
 * Run the CLI under a pty and return everything it painted.
 *
 * Only cases settled *before* any site is contacted belong here — the whole
 * suite is offline, and a case that reaches the network would break that
 * quietly. Both tests below are decided by argument handling alone: one is
 * cancelled at the picker, the other never gets past it.
 */
function runCli(args, keystrokes) {
	return new Promise((resolve, reject) => {
		const child = spawn('script', ['-qec', `node bin/any-dl.js ${args}`, '/dev/null'], {
			cwd: ROOT,
			// A value set on the developer's machine would answer the very
			// question these tests are about.
			env: { ...process.env, ANY_DL_PROVIDER: '' },
		});

		let output = '';
		child.stdout.on('data', (chunk) => {
			output += chunk;
		});
		child.on('error', reject);
		child.on('close', () => resolve(output));

		child.stdin.write(keystrokes);
		child.stdin.end();
	});
}

test('a bare channel name asks which site', { skip: SKIP, timeout: 30_000 }, async () => {
	// q cancels the picker, so this ends without touching a site.
	const output = await runCli('somechannel --list', 'q');
	assert.match(output, /Which site\?/);
	assert.match(output, /Kick/);
	assert.match(output, /Twitch/);
});

test('--yes refuses an ambiguous name instead of asking', { skip: SKIP, timeout: 30_000 }, async () => {
	// --yes promises no prompts, and there is no default site to fall back on,
	// so the honest outcome is a refusal naming the way to be explicit.
	const output = await runCli('somechannel --list --yes', 'q');

	// Asserted positively as well as negatively: a doesNotMatch on its own would
	// still pass if the command had died before printing anything at all.
	assert.match(output, /could be a channel on any of the supported sites/);
	assert.match(output, /--provider/);
	assert.doesNotMatch(output, /Which site\?/);
});
