import { UserFacingError } from '../util.js';
import * as kick from './kick.js';

/**
 * Every site the tool knows how to read. Adding one means writing a module
 * here that exports `key`, `label`, `matchUrl`, `webUrl`, `parseTarget`,
 * `getVideo`, `getClip`, `getChannelVods` and `getChannelClips`, then listing
 * it below. Nothing outside this directory should need to change.
 */
export const PROVIDERS = [kick];

/**
 * Where input that names no site of its own goes. A bare channel name looks
 * identical on every site, so it cannot be routed by inspection — something
 * has to decide, and until a second provider exists that decision is trivial.
 */
export const DEFAULT_PROVIDER = kick;

/** The provider that should handle this input, by hostname when there is one. */
export function providerFor(input) {
	const raw = String(input ?? '').trim();
	if (!raw) throw new UserFacingError('No channel or link given.');

	if (!/^https?:\/\//i.test(raw)) return DEFAULT_PROVIDER;

	let url;
	try {
		url = new URL(raw);
	} catch {
		throw new UserFacingError(`Not a valid URL: ${raw}`);
	}

	const provider = PROVIDERS.find((candidate) => candidate.matchUrl(url));
	if (!provider) {
		throw new UserFacingError(
			`Nothing here can download from ${url.hostname}.`,
			`Supported sites: ${PROVIDERS.map((p) => p.label).join(', ')}.`
		);
	}

	return provider;
}

/** Look a provider up by the key that appears in --json output. */
export function providerByKey(key) {
	return PROVIDERS.find((provider) => provider.key === key) ?? null;
}
