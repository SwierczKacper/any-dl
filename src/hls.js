import { getText } from './http.js';
import { UserFacingError } from './util.js';

function parseAttributes(line) {
	const attributes = {};
	// Split on commas that are not inside quotes.
	for (const pair of line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
		const eq = pair.indexOf('=');
		if (eq === -1) continue;
		attributes[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim().replace(/^"|"$/g, '');
	}
	return attributes;
}

/**
 * Turn a master playlist into a list of quality variants, best first.
 */
export function parseMasterPlaylist(text, masterUrl) {
	const lines = text.split(/\r?\n/);
	const variants = [];

	for (let i = 0; i < lines.length; i += 1) {
		if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue;

		const uri = lines.slice(i + 1).find((line) => line.trim() && !line.startsWith('#'));
		if (!uri) continue;

		const attributes = parseAttributes(lines[i].slice('#EXT-X-STREAM-INF:'.length));
		const [width, height] = (attributes.RESOLUTION ?? '').split('x').map(Number);
		const frameRate = Math.round(Number(attributes['FRAME-RATE'])) || null;

		variants.push({
			name: attributes.VIDEO || (height ? `${height}p${frameRate ?? ''}` : `variant-${variants.length + 1}`),
			width: width || null,
			height: height || null,
			frameRate,
			bandwidth: Number(attributes.BANDWIDTH) || 0,
			url: new URL(uri.trim(), masterUrl).href,
		});
	}

	if (variants.length === 0) {
		throw new UserFacingError('The master playlist contained no video variants.');
	}

	return variants.sort((a, b) => b.bandwidth - a.bandwidth || (b.height ?? 0) - (a.height ?? 0));
}

export async function getVariants(masterUrl) {
	const text = await getText(masterUrl, {
		hint: 'The video may have been pruned, made private, or restricted to subscribers.',
	});
	return parseMasterPlaylist(text, masterUrl);
}

/**
 * Resolve a --quality value against the available variants.
 * Accepts "best", "worst", an exact name ("1080p60"), or a height ("720", "720p").
 */
export function selectVariant(variants, quality = 'best') {
	const wanted = String(quality).trim().toLowerCase();

	if (!wanted || wanted === 'best' || wanted === 'source' || wanted === 'max') return variants[0];
	if (wanted === 'worst' || wanted === 'min') return variants[variants.length - 1];

	const exact = variants.find((variant) => variant.name.toLowerCase() === wanted);
	if (exact) return exact;

	const heightMatch = wanted.match(/^(\d{3,4})p?/);
	if (heightMatch) {
		const height = Number(heightMatch[1]);
		const sameHeight = variants.filter((variant) => variant.height === height);
		if (sameHeight.length > 0) return sameHeight[0];

		// Fall back to the closest quality that does not exceed what was asked for.
		const belowOrEqual = variants.find((variant) => (variant.height ?? 0) <= height);
		if (belowOrEqual) return belowOrEqual;
	}

	throw new UserFacingError(
		`Quality "${quality}" is not available.`,
		`Available: ${variants.map((variant) => variant.name).join(', ')}`
	);
}

export function describeVariant(variant) {
	const resolution = variant.width && variant.height ? `${variant.width}x${variant.height}` : 'unknown';
	const mbps = variant.bandwidth ? `${(variant.bandwidth / 1_000_000).toFixed(2)} Mbps` : 'unknown bitrate';
	return `${variant.name} (${resolution}, ${mbps})`;
}

/**
 * Rough size of `seconds` of this variant, in bytes.
 *
 * BANDWIDTH in a master playlist is the variant's *peak* rate, so this comes out
 * a few per cent high — the safe direction for a number whose job is to warn
 * someone before they fill a disk. Null when there is nothing to go on.
 */
export function estimateBytes(variant, seconds) {
	if (!variant?.bandwidth || !Number.isFinite(seconds) || seconds <= 0) return null;
	return (variant.bandwidth * seconds) / 8;
}
