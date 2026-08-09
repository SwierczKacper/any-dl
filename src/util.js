import fs, { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, isAbsolute, join, resolve } from 'node:path';

// Characters no filesystem accepts, plus '!' — legal, but it triggers history
// expansion in interactive shells, which makes such files annoying to handle.
const ILLEGAL_CHARS = '<>:"/\\|?*!';
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// Letters that carry no combining mark, so NFD alone cannot reduce them.
const TRANSLITERATIONS = {
	ł: 'l', Ł: 'L',
	ø: 'o', Ø: 'O',
	đ: 'd', Đ: 'D',
	ð: 'd', Ð: 'D',
	ß: 'ss',
	æ: 'ae', Æ: 'AE',
	œ: 'oe', Œ: 'OE',
	þ: 'th', Þ: 'TH',
	ı: 'i',
};

/**
 * Reduce accented Latin letters to their plain form: ÓWKA → OWKA, żółć → zolc.
 * Scripts with no ASCII equivalent — Cyrillic, Greek, CJK — are left untouched,
 * because mangling them would be worse than keeping them.
 */
function foldDiacritics(text) {
	let out = '';
	for (const ch of text.normalize('NFD')) {
		if (/\p{M}/u.test(ch)) continue; // combining accent
		out += TRANSLITERATIONS[ch] ?? ch;
	}
	return out.normalize('NFC');
}

function stripIllegalChars(text) {
	let out = '';
	for (const ch of text) {
		if (ch.codePointAt(0) < 0x20) continue; // control codes
		if (ILLEGAL_CHARS.includes(ch)) continue;
		out += ch;
	}
	return out;
}

/**
 * Turn an arbitrary stream title into something every filesystem accepts, with
 * accents folded away so the name stays portable across systems and shells.
 */
export function sanitizeFilename(name, maxLength = 120) {
	let clean = stripIllegalChars(foldDiacritics(String(name ?? '')))
		.replace(/\s+/g, ' ')
		.replace(/^[.\s]+|[.\s]+$/g, '')
		.trim();

	if (clean.length > maxLength) clean = clean.slice(0, maxLength).trim();
	if (!clean || RESERVED_WINDOWS_NAMES.test(clean)) clean = 'video';

	return clean;
}

/**
 * Stream titles are advertising space: they routinely end in a run of chat
 * commands ("!sklep !skins !holy") that say nothing about the video. Strip
 * those, tidy the leftover punctuation, and keep the part worth reading.
 */
export function normalizeTitle(title, maxLength = 90) {
	let clean = String(title ?? '')
		.normalize('NFC')
		// A chat command is a lone "!word" token — drop it wherever it appears.
		.replace(/(^|\s)![\p{L}\p{N}_]+/gu, ' ');

	clean = stripIllegalChars(clean)
		.replace(/\s+/g, ' ')
		// Separators left dangling once the commands are gone.
		.replace(/\s*[-–—|]\s*(?=[-–—|]|$)/g, ' ')
		.replace(/^[\s.,;:_-]+|[\s.,;:_-]+$/g, '')
		.trim();

	if (clean.length > maxLength) {
		const cut = clean.slice(0, maxLength);
		// Only back off to the previous space when the cut lands mid-word.
		const lastSpace = cut.lastIndexOf(' ');
		const endsOnWord = clean[maxLength] === ' ';
		clean = (endsOnWord || lastSpace <= maxLength * 0.6 ? cut : cut.slice(0, lastSpace))
			.replace(/[\s.,;:_-]+$/g, '')
			.trim();
	}

	return clean || 'untitled';
}

function expandHome(path) {
	if (path === '~') return homedir();
	if (path.startsWith('~/')) return join(homedir(), path.slice(2));
	return path;
}

/**
 * Work out where a download should land.
 *
 * An explicit --dir wins, then the ANY_DL_DIR environment variable, then the
 * current directory — which keeps the default behaving like any other CLI tool.
 */
export function resolveOutputDir({ dir, envDir, channel, perChannel = false, cwd = process.cwd() }) {
	const base = expandHome(String(dir || envDir || cwd));
	const absolute = isAbsolute(base) ? base : resolve(cwd, base);

	if (!perChannel || !channel) return absolute;

	return join(absolute, sanitizeFilename(channel, 60));
}

/**
 * Free space on the filesystem holding `path`, in bytes.
 *
 * Uses the space available to an unprivileged user, not the raw free blocks, so
 * it matches what `df` reports. Returns null when it cannot be determined —
 * statfsSync arrived in Node 18.15 — and callers must treat that as "unknown"
 * rather than "no space".
 */
export function freeSpaceBytes(path) {
	if (typeof fs.statfsSync !== 'function') return null;

	try {
		const { bavail, bsize } = fs.statfsSync(path);
		const free = Number(bavail) * Number(bsize);
		return Number.isFinite(free) && free >= 0 ? free : null;
	} catch {
		return null;
	}
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
 * Every timestamp a site hands us, whatever shape it arrives in.
 *
 * Kick mixes two: "2026-08-07T17:28:32+00:00" in some responses and
 * "2026-08-07 17:28:32" in others. The second is UTC as well, but Date() reads
 * it as local time — so the offset is pinned explicitly. Twitch only ever sends
 * the first form, and passes through unchanged.
 */
export function parseTimestamp(value) {
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
