import { UserFacingError } from '../util.js';
import * as kick from './kick.js';
import * as twitch from './twitch.js';

/**
 * Every site the tool knows how to read. Adding one means writing a module
 * here that exports `key`, `label`, `matchUrl`, `webUrl`, `parseTarget`,
 * `getVideo`, `getClip`, `getChannelVods` and `getChannelClips`, then listing
 * it below. Nothing outside this directory should need to change.
 */
export const PROVIDERS = [kick, twitch];

/**
 * The provider a link belongs to, decided by its hostname.
 *
 * Links only. A bare channel name looks identical on every site, so there is
 * nothing here to inspect and nothing this function could honestly return —
 * that question belongs to `resolveProvider`, which can ask. There is
 * deliberately no default site: assuming one would mean quietly downloading
 * from somewhere the user did not name.
 *
 * `providers` is injectable so these paths stay testable independently of
 * whichever sites happen to be registered.
 */
export function providerFor(input, providers = PROVIDERS) {
	const raw = String(input ?? '').trim();
	if (!raw) throw new UserFacingError('No channel or link given.');

	if (!isUrl(raw)) {
		throw new UserFacingError(
			`"${raw}" is not a link, so there is no site to read from it.`,
			`Say which with --provider, or name it first: any-dl ${providers[0].key} ${raw}.`
		);
	}

	let url;
	try {
		url = new URL(raw);
	} catch {
		throw new UserFacingError(`Not a valid URL: ${raw}`);
	}

	const provider = providers.find((candidate) => candidate.matchUrl(url));
	if (!provider) {
		throw new UserFacingError(
			`Nothing here can download from ${url.hostname}.`,
			`Supported sites: ${providers.map((p) => p.label).join(', ')}.`
		);
	}

	return provider;
}

/** Look a provider up by the key that appears in --json output. */
export function providerByKey(key, providers = PROVIDERS) {
	return providers.find((provider) => provider.key === key) ?? null;
}

/** Whether the input names its own site, in which case nothing needs deciding. */
export function isUrl(input) {
	return /^https?:\/\//i.test(String(input ?? '').trim());
}

function requireProvider(key, providers) {
	const provider = providerByKey(key, providers);
	if (!provider) {
		throw new UserFacingError(
			`Unknown site: ${key}`,
			`Known sites: ${providers.map((p) => p.key).join(', ')}.`
		);
	}
	return provider;
}

/**
 * Decide which site to use, asking only when the answer cannot be worked out.
 *
 * A link settles it by itself. Otherwise an explicit choice wins, then the
 * environment, then — if there is only one site — the obvious answer. Only a
 * genuinely ambiguous name reaches the picker, which is why nothing is asked
 * today and the question appears by itself once a second site exists.
 */
export async function resolveProvider({ target, provider, env, chooseSite, providers = PROVIDERS } = {}) {
	if (isUrl(target)) {
		const detected = providerFor(target, providers);
		if (provider && providerByKey(provider, providers) !== detected) {
			throw new UserFacingError(
				`That is a ${detected.label} link, but ${provider} was given.`,
				'Drop the site name, or pass a link to that site instead.'
			);
		}
		return detected;
	}

	if (provider) return requireProvider(provider, providers);
	if (env) return requireProvider(env, providers);
	if (providers.length === 1) return providers[0];

	if (!chooseSite) {
		throw new UserFacingError(
			`"${target}" could be a channel on any of the supported sites.`,
			`Say which with --provider, e.g. --provider ${providers[0].key}, or name it first: any-dl ${providers[0].key} ${target}.`
		);
	}

	return chooseSite(providers);
}
