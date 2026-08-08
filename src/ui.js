import { parseKickDate } from './util.js';

const useColor =
	process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';

const wrap = (open, close) => (text) =>
	useColor ? `\x1b[${open}m${text}\x1b[${close}m` : String(text);

export const c = {
	bold: wrap(1, 22),
	dim: wrap(2, 22),
	red: wrap(31, 39),
	green: wrap(32, 39),
	yellow: wrap(33, 39),
	blue: wrap(34, 39),
	magenta: wrap(35, 39),
	cyan: wrap(36, 39),
	gray: wrap(90, 39),
};

// Status output goes to stderr so that stdout stays clean for --json.
export const info = (msg) => process.stderr.write(`${c.cyan('›')} ${msg}\n`);
export const success = (msg) => process.stderr.write(`${c.green('✓')} ${msg}\n`);
export const warn = (msg) => process.stderr.write(`${c.yellow('!')} ${msg}\n`);
export const error = (msg) => process.stderr.write(`${c.red('✗')} ${msg}\n`);

export function formatBytes(bytes) {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** i;
	return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(totalSeconds) {
	if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--:--';
	const s = Math.floor(totalSeconds);
	const pad = (n) => String(n).padStart(2, '0');
	return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Rendered in the viewer's local timezone. */
export function formatDate(value) {
	const date = parseKickDate(value);
	if (!date) return value ? String(value) : 'unknown date';

	const pad = (n) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function progressBar(ratio, width = 24) {
	const clamped = Math.max(0, Math.min(1, ratio));
	const filled = Math.round(clamped * width);
	return `${'█'.repeat(filled)}${c.gray('░'.repeat(width - filled))}`;
}

/** Bytes per second as "38.2 MB/s"; empty string when it is not yet known. */
export function formatRate(bytesPerSecond) {
	if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '';
	return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Lay the progress display out as lines.
 *
 * Two lines when there is room — the bar and headline figures on top, the
 * detail below — because cramming position, size, rate and ETA onto one line
 * makes none of them readable. Narrow terminals get the compact version rather
 * than a wrapped mess. Returns plain strings so the layout stays testable.
 */
export function formatProgress({ ratio, seconds, totalSeconds, bytes, totalBytes, rate, speed, width = 80 }) {
	const percent = ratio != null ? `${(ratio * 100).toFixed(1)}%` : '';
	const remaining = ratio != null && ratio > 0 && speed > 0 ? (seconds / ratio - seconds) / speed : null;
	const eta = remaining != null ? `ETA ${formatDuration(remaining)}` : '';

	const position = totalSeconds
		? `${formatDuration(seconds)} / ${formatDuration(totalSeconds)}`
		: formatDuration(seconds);
	const size = totalBytes ? `${formatBytes(bytes)} / ~${formatBytes(totalBytes)}` : formatBytes(bytes);
	const rateText = formatRate(rate);
	const realtime = speed > 0 ? `${speed.toFixed(1)}x realtime` : '';

	if (width < 72) {
		return [`  ${[percent, size, rateText, eta].filter(Boolean).join('  ')}`];
	}

	return [
		`  ${progressBar(ratio ?? 0)}  ${percent.padStart(6)}   ${eta}`,
		`  ${[position, size, rateText, realtime].filter(Boolean).join('   ')}`,
	];
}
