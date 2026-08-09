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

/**
 * The provider that should handle this input, by hostname when there is one.
 *
 * `providers` is injectable so the multi-site paths can be tested while only
 * one site exists — otherwise the code that matters most here would go
 * unexercised until the day a second one is added.
 */
export function providerFor(input, providers = PROVIDERS) {
	const raw = String(input ?? '').trim();
	if (!raw) throw new UserFacingError('No channel or link given.');

	if (!isUrl(raw)) return providers.length === 1 ? providers[0] : DEFAULT_PROVIDER;

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
