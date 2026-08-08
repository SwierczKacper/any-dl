#!/usr/bin/env node
import { run } from '../src/cli.js';
import { c, error } from '../src/ui.js';

try {
	process.exitCode = await run(process.argv.slice(2));
} catch (err) {
	if (err?.name === 'UserFacingError') {
		error(err.message);
		if (err.hint) process.stderr.write(`  ${c.gray(err.hint)}\n`);
	} else {
		error(err?.stack ?? String(err));
	}
	process.exitCode = 1;
}
