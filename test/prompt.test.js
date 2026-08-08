import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { fit } from '../src/prompt.js';

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

// No trailing newline anywhere below: a single keypress must be enough.
test('confirm answers on the y key alone', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('confirm-default-yes', 'y'), /RESULT=true/);
});

test('confirm answers on the n key alone', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('confirm-default-yes', 'n'), /RESULT=false/);
});

test('confirm accepts an uppercase answer', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('confirm-default-yes', 'Y'), /RESULT=true/);
	assert.match(await runPrompt('confirm-default-yes', 'N'), /RESULT=false/);
});

test('confirm falls back to its default on a bare Enter', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('confirm-default-yes', '\r'), /RESULT=true/);
	assert.match(await runPrompt('confirm-default-no', '\r'), /RESULT=false/);
});

test('confirm waits rather than guessing on an unrelated key', { skip: SKIP, timeout: 30_000 }, async () => {
	// "x" must not be read as either answer — the y that follows decides.
	assert.match(await runPrompt('confirm-default-yes', 'xq5y'), /RESULT=true/);
});

// Ctrl+C is not covered here: script(1)'s pty translates it to SIGINT before the
// process can see it, so the harness kills the child instead of exercising the
// handler. Escape is not handled at all — readline cannot distinguish a lone ESC
// from the start of an arrow-key sequence, so it would hang waiting for more input.

test('input returns the typed text', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('input', 'xmerghani\n'), /RESULT="xmerghani"/);
});

test('input returns null when nothing is typed', { skip: SKIP, timeout: 30_000 }, async () => {
	assert.match(await runPrompt('input', '\n'), /RESULT=null/);
});

test('fit keeps runs of spaces, because callers align columns with them', () => {
	assert.equal(fit('1080p60  1920x1080  8.66 Mbps'), '1080p60  1920x1080  8.66 Mbps');
});

test('fit flattens line breaks and tabs', () => {
	assert.equal(fit('two\nlines\there'), 'two lines here');
});

test('fit truncates rather than letting a line wrap', () => {
	const result = fit('x'.repeat(500), 4);
	assert.ok(result.length < 500);
	assert.ok(result.endsWith('…'));
});
