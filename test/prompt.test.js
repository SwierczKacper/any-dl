import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUNNER = 'scripts/prompt-runner.mjs';

// The prompts only engage when stdin and stderr are TTYs, so a plain pipe would
// skip exactly the code that needs covering. script(1) gives us a real pty.
const HAS_PTY =
	process.platform === 'linux' && spawnSync('script', ['--version'], { stdio: 'ignore' }).status === 0;
const SKIP = HAS_PTY ? false : 'requires a Linux pty via script(1)';

function runPrompt(mode, keystrokes) {
	return new Promise((resolve, reject) => {
		const child = spawn('script', ['-qec', `node ${RUNNER} ${mode}`, '/dev/null'], { cwd: ROOT });

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

test('confirm resolves true when the user types y', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('confirm-default-yes', 'y\n'), /RESULT=true/);
});

test('confirm resolves false when the user types n', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('confirm-default-yes', 'n\n'), /RESULT=false/);
});

test('confirm falls back to its default on a bare Enter', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('confirm-default-yes', '\n'), /RESULT=true/);
	assert.match(await runPrompt('confirm-default-no', '\n'), /RESULT=false/);
});

test('confirm accepts the spelled-out answer', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('confirm-default-yes', 'yes\n'), /RESULT=true/);
});

test('input returns the typed text', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('input', 'xmerghani\n'), /RESULT="xmerghani"/);
});

test('input returns null when nothing is typed', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('input', '\n'), /RESULT=null/);
});
