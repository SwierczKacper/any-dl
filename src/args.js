import { UserFacingError } from './util.js';

const FLAGS = new Set([
	'--clips',
	'--list',
	'--qualities',
	'--json',
	'--faststart',
	'--channel-dir',
	'--no-progress',
	'--yes',
	'--help',
	'--version',
]);

const ALIASES = {
	'-q': '--quality',
	'-o': '--output',
	'-d': '--dir',
	'-n': '--limit',
	'-l': '--list',
	'-y': '--yes',
	'-h': '--help',
	'-v': '--version',
};

export const HELP_TEXT = `
kick-vod — download VODs and clips from kick.com in full quality

Usage
  kick-vod <url|channel|uuid> [options]

Targets
  https://kick.com/<channel>/videos/<uuid>   a specific VOD
  https://kick.com/<channel>?clip=clip_xxx   a specific clip
  <channel>                                  pick from that channel's latest VODs
  <uuid>                                     a VOD by id

Options
  -q, --quality <q>   best, worst, or an exact variant like 1080p60 / 720
                      (omit it and you get a picker showing sizes)
      --qualities     list the available qualities for the target and exit
  -o, --output <file> output filename
                      (default: "<channel> - <date> - <title>.mp4")
  -d, --dir <dir>     output directory (default: $KICK_VOD_DIR, else current dir)
      --channel-dir   save into a per-channel subdirectory of the output directory
      --from <time>   start at this position, e.g. 00:12:30
      --to <time>     stop at this position, e.g. 01:45:00
      --clips         operate on the channel's clips instead of its VODs
  -l, --list          list the channel's VODs/clips and exit
  -n, --limit <n>     how many entries to list (default: 20)
      --faststart     move the MP4 index to the front (extra pass, slow on big files)
  -y, --yes           do not ask for confirmation
      --json          print machine-readable metadata to stdout instead of downloading
      --no-progress   plain log lines instead of a progress bar
  -h, --help          show this help
  -v, --version       show the version

Environment
  KICK_VOD_DIR  default output directory, so you can run this from anywhere
  CHROME_PATH   path to a Chrome/Chromium binary (auto-detected otherwise)
  FFMPEG_PATH   path to an ffmpeg binary (auto-detected otherwise)

Examples
  kick-vod https://kick.com/somechannel/videos/019fdd44-f600-7184-bf35-ff795a9b372c
  kick-vod somechannel --quality 720p60 --dir ~/Videos
  kick-vod <url> --dir ~/Videos --channel-dir
  kick-vod <url> --from 01:00:00 --to 01:15:00 -o highlight.mp4

Not affiliated with Kick. For personal, lawful use only — you are responsible
for respecting Kick's Terms of Service and the rights of content creators.
See the README for the full disclaimer.
`.trim();

export function parseArgs(argv) {
	const options = {
		target: null,
		// null means "ask" — an explicit --quality skips the picker.
		quality: null,
		output: null,
		// Left null so the caller can fall back to KICK_VOD_DIR before the cwd.
		dir: null,
		channelDir: false,
		from: null,
		to: null,
		clips: false,
		list: false,
		qualities: false,
		limit: 20,
		faststart: false,
		yes: false,
		json: false,
		progress: true,
		help: false,
		version: false,
	};

	for (let i = 0; i < argv.length; i += 1) {
		let arg = argv[i];

		if (!arg.startsWith('-')) {
			if (options.target) throw new UserFacingError(`Unexpected extra argument: ${arg}`);
			options.target = arg;
			continue;
		}

		// Support --key=value.
		let inlineValue = null;
		const eq = arg.indexOf('=');
		if (eq !== -1 && arg.startsWith('--')) {
			inlineValue = arg.slice(eq + 1);
			arg = arg.slice(0, eq);
		}

		const name = ALIASES[arg] ?? arg;
		const takeValue = () => {
			const value = inlineValue ?? argv[++i];
			if (value == null) throw new UserFacingError(`Option ${arg} needs a value.`);
			return value;
		};

		switch (name) {
			case '--quality': options.quality = takeValue(); break;
			case '--output': options.output = takeValue(); break;
			case '--dir': options.dir = takeValue(); break;
			case '--from': options.from = takeValue(); break;
			case '--to': options.to = takeValue(); break;
			case '--limit': {
				const limit = Number(takeValue());
				if (!Number.isInteger(limit) || limit < 1) throw new UserFacingError('--limit must be a positive integer.');
				options.limit = limit;
				break;
			}
			case '--channel-dir': options.channelDir = true; break;
			case '--clips': options.clips = true; break;
			case '--list': options.list = true; break;
			case '--qualities': options.qualities = true; break;
			case '--faststart': options.faststart = true; break;
			case '--yes': options.yes = true; break;
			case '--json': options.json = true; break;
			case '--no-progress': options.progress = false; break;
			case '--help': options.help = true; break;
			case '--version': options.version = true; break;
			default:
				throw new UserFacingError(`Unknown option: ${arg}`, 'Run kick-vod --help to see the available options.');
		}

		if (inlineValue != null && FLAGS.has(name)) {
			throw new UserFacingError(`Option ${name} does not take a value.`);
		}
	}

	return options;
}
