import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

// Characters no filesystem accepts. Spaces are kept on purpose.
const ILLEGAL_CHARS = '<>:"/\\|?*';
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function stripIllegalChars(text) {
	let out = '';
	for (const ch of text) {
		if (ch.codePointAt(0) < 0x20) continue; // control codes
		if (ILLEGAL_CHARS.includes(ch)) continue;
		out += ch;
	}
	return out;
}

/** Turn an arbitrary stream title into something every filesystem accepts. */
export function sanitizeFilename(name, maxLength = 120) {
	let clean = stripIllegalChars(String(name ?? ''))
		.replace(/\s+/g, ' ')
		.replace(/^[.\s]+|[.\s]+$/g, '')
		.trim();

	if (clean.length > maxLength) clean = clean.slice(0, maxLength).trim();
	if (!clean || RESERVED_WINDOWS_NAMES.test(clean)) clean = 'kick-video';

	return clean;
}

/** Append " (2)", " (3)", … until the path is free, so we never clobber a finished download. */
export function uniquePath(dir, filename) {
	const ext = extname(filename);
	const stem = filename.slice(0, filename.length - ext.length);

	let candidate = join(dir, filename);
	let counter = 2;
	while (existsSync(candidate)) {
		candidate = join(dir, `${stem} (${counter})${ext}`);
		counter += 1;
	}
	return candidate;
}

/**
 * Parse "90", "1:30", "01:23:45" or "00:00:04.5" into seconds.
 * Returns null when the input is not a valid timecode.
 */
export function parseTimecode(input) {
	if (input == null) return null;
	const raw = String(input).trim();
	if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(raw)) return null;

	const parts = raw.split(':').map(Number);
	if (parts.some((n) => Number.isNaN(n))) return null;

	return parts.reduce((total, part) => total * 60 + part, 0);
}

/**
 * Kick mixes timestamp formats: "2026-08-07T17:28:32+00:00" in some responses,
 * "2026-08-07 17:28:32" in others. The second form is UTC too, but Date() would
 * read it as local time — so pin it to UTC explicitly.
 */
export function parseKickDate(value) {
	if (!value) return null;

	let text = String(value).trim().replace(' ', 'T');
	if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) text += 'Z';

	const date = new Date(text);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function isUuid(value) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Kick migrated its VOD ids to UUIDv7, whose first 48 bits are a millisecond
 * timestamp — and for a VOD that timestamp is exactly the stream's start time.
 * That is what lets us match a new-style link against the older API.
 * Returns null for any other UUID version.
 */
export function uuidV7Timestamp(uuid) {
	if (!isUuid(uuid) || uuid[14] !== '7') return null;

	const milliseconds = parseInt(uuid.replace(/-/g, '').slice(0, 12), 16);
	if (!Number.isFinite(milliseconds)) return null;

	const date = new Date(milliseconds);
	return Number.isNaN(date.getTime()) ? null : date;
}

/** Errors we raise ourselves — printed as a plain message instead of a stack trace. */
export class UserFacingError extends Error {
	constructor(message, hint) {
		super(message);
		this.name = 'UserFacingError';
		this.hint = hint;
	}
}
