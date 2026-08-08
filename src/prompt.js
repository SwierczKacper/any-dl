import readline from 'node:readline';
// The promise-returning question() lives here; the callback-style one in
// node:readline returns undefined.
import { createInterface } from 'node:readline/promises';
import { c } from './ui.js';

export function isInteractive() {
	return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

function terminalWidth() {
	return process.stderr.columns || 80;
}

/** Cut a raw (uncoloured) string so a rendered line never wraps. */
function fit(text, reserved = 4) {
	const max = Math.max(20, terminalWidth() - reserved);
	const flat = String(text).replace(/\s+/g, ' ');
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Arrow-key list picker rendered on stderr.
 * Resolves with the chosen choice's `value`, or null if the user cancels.
 */
export function select({ message, choices, pageSize = 8 }) {
	if (choices.length === 0) return Promise.resolve(null);
	if (!isInteractive()) {
		return Promise.reject(new Error('An interactive terminal is required to choose from a list.'));
	}

	return new Promise((resolve) => {
		const out = process.stderr;
		let index = 0;
		let offset = 0;
		let renderedLines = 0;

		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true);
		process.stdin.resume();
		out.write('\x1b[?25l'); // hide cursor

		const finish = (value) => {
			process.stdin.off('keypress', onKeypress);
			process.stdin.setRawMode(false);
			process.stdin.pause();
			clear();
			out.write('\x1b[?25h'); // show cursor
			resolve(value);
		};

		const clear = () => {
			if (renderedLines === 0) return;
			readline.moveCursor(out, 0, -renderedLines);
			readline.cursorTo(out, 0);
			readline.clearScreenDown(out);
			renderedLines = 0;
		};

		const render = () => {
			clear();

			if (index < offset) offset = index;
			if (index >= offset + pageSize) offset = index - pageSize + 1;

			const lines = [
				`${c.cyan('?')} ${c.bold(message)} ${c.gray('— ↑/↓ move, Enter select, q quit')}`,
			];

			choices.slice(offset, offset + pageSize).forEach((choice, i) => {
				const active = offset + i === index;
				const label = fit(choice.name, 6);
				lines.push(active ? `${c.cyan('❯')} ${c.cyan(label)}` : `  ${label}`);
				if (active && choice.description) lines.push(`    ${c.gray(fit(choice.description, 8))}`);
			});

			if (choices.length > pageSize) {
				lines.push(c.gray(`  ${index + 1}/${choices.length}`));
			}

			out.write(`${lines.join('\n')}\n`);
			renderedLines = lines.length;
		};

		const onKeypress = (_str, key) => {
			if (!key) return;

			if ((key.ctrl && key.name === 'c') || key.name === 'escape' || key.name === 'q') {
				finish(null);
				return;
			}
			if (key.name === 'return' || key.name === 'enter') {
				finish(choices[index].value);
				return;
			}

			if (key.name === 'up' || key.name === 'k') index = (index - 1 + choices.length) % choices.length;
			else if (key.name === 'down' || key.name === 'j') index = (index + 1) % choices.length;
			else if (key.name === 'pageup') index = Math.max(0, index - pageSize);
			else if (key.name === 'pagedown') index = Math.min(choices.length - 1, index + pageSize);
			else if (key.name === 'home') index = 0;
			else if (key.name === 'end') index = choices.length - 1;
			else return;

			render();
		};

		process.stdin.on('keypress', onKeypress);
		render();
	});
}

/** Free-text question. Returns null when there is no TTY or the answer is empty. */
export async function input({ message }) {
	if (!isInteractive()) return null;

	const rl = createInterface({ input: process.stdin, output: process.stderr });
	try {
		const answer = await rl.question(`${c.cyan('?')} ${c.bold(message)}: `);
		return answer.trim() || null;
	} finally {
		rl.close();
	}
}

/** Yes/no question. Returns the default when stdin is not a TTY. */
export async function confirm({ message, defaultValue = true }) {
	if (!isInteractive()) return defaultValue;

	const rl = createInterface({ input: process.stdin, output: process.stderr });
	const suffix = defaultValue ? 'Y/n' : 'y/N';

	try {
		const answer = await rl.question(`${c.cyan('?')} ${c.bold(message)} ${c.gray(`(${suffix})`)} `);
		const normalized = answer.trim().toLowerCase();
		if (!normalized) return defaultValue;
		return normalized === 'y' || normalized === 'yes';
	} finally {
		rl.close();
	}
}
