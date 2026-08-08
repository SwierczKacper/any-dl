// Helper for prompt.test.js: exercises one prompt and reports what it returned.
// Run under a pty (see script(1)) so the prompts consider themselves interactive.
import { confirm, input } from '../src/prompt.js';

const mode = process.argv[2];

let result;
if (mode === 'confirm-default-yes') {
	result = await confirm({ message: 'Proceed?', defaultValue: true });
} else if (mode === 'confirm-default-no') {
	result = await confirm({ message: 'Proceed?', defaultValue: false });
} else if (mode === 'input') {
	result = await input({ message: 'Name' });
} else {
	throw new Error(`unknown mode: ${mode}`);
}

process.stdout.write(`\nRESULT=${JSON.stringify(result)}\n`);
