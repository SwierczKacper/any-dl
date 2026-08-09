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

const PROGRESS_MODES = new Set(['auto', 'json', 'none']);

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
any-dl — download videos to MP4 in full quality, straight from the terminal

Usage
  any-dl [site] <url|channel|id> [options]

Supported sites
  kick.com     VODs and clips
  twitch.tv    VODs and clips

  A link picks its site by itself. A bare channel name cannot, so name the site
  first, use --provider, or set ANY_DL_PROVIDER — otherwise you are asked which
  one you meant.

Targets
  https://kick.com/<channel>/videos/<id>     a specific VOD
  https://kick.com/<channel>?clip=clip_xxx   a specific clip
  https://www.twitch.tv/videos/<id>          a specific VOD
  https://clips.twitch.tv/<slug>             a specific clip
  <channel>                                  pick from that channel's latest VODs
  <id>                                       a VOD by id

Options
  -q, --quality <q>     best, worst, or an exact variant like 1080p60 / 720
                        (omit it and you get a picker showing sizes)
      --qualities       list the available qualities and sizes, then exit
  -o, --output <file>   output filename
                        (default: "<channel> - <date> - <title>.mp4")
  -d, --dir <dir>       output directory (default: $ANY_DL_DIR, else current dir)
      --channel-dir     save into a per-channel subdirectory of the output directory
      --provider <site> which site to use, when a link does not already say
      --from <time>     start at this position, e.g. 00:12:30
      --to <time>       stop at this position, e.g. 01:45:00
      --clips           operate on the channel's clips instead of its VODs
                        (or press c in the picker to swap between the two)
  -l, --list            list the channel's VODs/clips and exit
  -n, --limit <n>       how many entries to list (default: 20)
      --faststart       move the MP4 index to the front (extra pass, slow on big files)
  -y, --yes             no prompts: best quality, fail if it will not fit on disk,
                        and fail rather than ask which site a bare name means
      --json            print machine-readable metadata to stdout instead of downloading
      --progress <m>    auto (default), json for NDJSON on stdout, or none
      --no-progress     alias for --progress none
  -h, --help            show this help
  -v, --version         show the version

Environment
  ANY_DL_DIR       default output directory, so you can run this from anywhere
  ANY_DL_PROVIDER  the site to use for bare channel names, instead of asking
  CHROME_PATH      path to a Chrome/Chromium binary (auto-detected otherwise)
                   needed for Kick only; Twitch does not use a browser
  FFMPEG_PATH      path to an ffmpeg binary (auto-detected otherwise)

Examples
  any-dl https://kick.com/somechannel/videos/019fdd44-f600-7184-bf35-ff795a9b372c
  any-dl https://www.twitch.tv/videos/2832871456
  any-dl kick somechannel --quality 720p60 --dir ~/Videos
  any-dl twitch somechannel --list
  any-dl <url> --dir ~/Videos --channel-dir
  any-dl <url> --from 01:00:00 --to 01:15:00 -o highlight.mp4

Not affiliated with Kick or Twitch. For personal, lawful use only — you are
responsible for respecting each site's Terms of Service and the rights of
content creators. See the README for the full disclaimer.
`.trim();

export function parseArgs(argv) {
	const options = {
		target: null,
		// Which site to use, when the target itself does not say. Set by
		// --provider, or by naming it first: `any-dl kick xqc`.
		provider: null,
		// null means "ask" — an explicit --quality skips the picker.
		quality: null,
		output: null,
		// Left null so the caller can fall back to ANY_DL_DIR before the cwd.
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
		// auto | json | none — see PROGRESS_MODES.
		progress: 'auto',
		help: false,
		version: false,
	};

	const positionals = [];

	for (let i = 0; i < argv.length; i += 1) {
		let arg = argv[i];

		if (!arg.startsWith('-')) {
			positionals.push(arg);
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
			case '--no-progress': options.progress = 'none'; break;
			case '--progress': {
				const mode = takeValue();
				if (!PROGRESS_MODES.has(mode)) {
					throw new UserFacingError(
						`--progress must be one of: ${[...PROGRESS_MODES].join(', ')}`,
						'auto shows a bar on a terminal and plain lines otherwise; json emits NDJSON on stdout.'
					);
				}
				options.progress = mode;
				break;
			}
			case '--provider': options.provider = takeValue(); break;
			case '--help': options.help = true; break;
			case '--version': options.version = true; break;
			default:
				throw new UserFacingError(`Unknown option: ${arg}`, 'Run any-dl --help to see the available options.');
		}

		if (inlineValue != null && FLAGS.has(name)) {
			throw new UserFacingError(`Option ${name} does not take a value.`);
		}
	}

	// One argument is the target. Two means the site was named first, as in
	// `any-dl kick xqc` — which is also how you reach a channel whose name
	// happens to match a site.
	if (positionals.length > 2) {
		throw new UserFacingError(
			`Unexpected extra argument: ${positionals[2]}`,
			'Expected at most a site and a target, e.g. any-dl kick somechannel.'
		);
	}

	if (positionals.length === 2) {
		if (options.provider && options.provider !== positionals[0]) {
			throw new UserFacingError(
				`Two different sites given: ${positionals[0]} and --provider ${options.provider}.`
			);
		}
		options.provider = positionals[0];
		options.target = positionals[1];
	} else {
		options.target = positionals[0] ?? null;
	}

	return options;
}
