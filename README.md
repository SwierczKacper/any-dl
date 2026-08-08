# kick-vod

**Download VODs and clips from [kick.com](https://kick.com) in full quality, straight to MP4.**

Paste a link, get the file. No re-encoding, no quality cap, **no npm dependencies**.

```bash
kick-vod https://kick.com/somechannel/videos/019fdd44-f600-7184-bf35-ff795a9b372c
```

```
› LAST DANCE GTA RP - STREFA.RP [DAY 1]
› 2026-08-07 19:28 · 08:07:45 · Just Chatting · 87,528 views
› Quality: 1080p60 (1920x1080, 8.66 Mbps)
› File:    xmerghani - 2026-08-07 - LAST DANCE GTA RP.mp4

  ████████████░░░░░░░░░░░░  52.4%  04:15:31  6.2 GB  47.3x  ETA 00:04:52
```

> **Not affiliated with Kick.** Please read [Legal & disclaimer](#️-legal--disclaimer) before use.

---

## Table of contents

- [Why another one](#why-another-one)
- [Requirements](#requirements)
- [Install](#install)
- [Usage](#usage)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [Legal & disclaimer](#️-legal--disclaimer)
- [License](#license)

---

## Why another one

Most existing Kick downloaders hardcode a low quality, ship a bundled ffmpeg binary
that crashes on some systems, or install a full headless-browser framework
(150+ packages) just to read a single JSON endpoint.

This one:

- **Always defaults to the best available quality** — 1080p60 if the stream had it
- **Uses your ffmpeg**, so it works wherever ffmpeg works
- **Zero npm dependencies** — it drives a Chrome you already have on disk
- **Real progress reporting**, because it knows the VOD duration up front
- **Grabs just a slice** of an 8-hour stream with `--from` / `--to`
- **Understands both old and new Kick links**, including the new UUIDv7 ids
- **Never overwrites** an existing file, and leaves a playable MP4 on Ctrl+C

---

## Requirements

| Tool | Why it's needed | Install |
| --- | --- | --- |
| **Node.js ≥ 18** | runtime | [nodejs.org](https://nodejs.org) |
| **ffmpeg** | downloads the HLS stream and writes the MP4 | `apt install ffmpeg` · `brew install ffmpeg` · `winget install ffmpeg` |
| **Chrome / Chromium** | Kick's API sits behind Cloudflare, which rejects non-browser clients | `apt install chromium-browser`, or any Chrome / Brave / Edge you already have |

Both are auto-detected — including a Chrome that Puppeteer downloaded for some other
project. Override either with an environment variable:

```bash
export CHROME_PATH=/usr/bin/chromium
export FFMPEG_PATH=/usr/local/bin/ffmpeg
```

A third variable, `KICK_VOD_DIR`, sets where downloads go — see
[Where files land](#where-files-land-and-what-theyre-called).

No Chrome anywhere on the machine? Fetch a private copy (this does **not** add a
dependency to the project — it just puts a browser on disk):

```bash
npx @puppeteer/browsers install chrome@stable
```

---

## Install

### Option 1 — clone and link (recommended)

```bash
git clone https://github.com/SwierczKacper/kick-vod.git
cd kick-vod
npm link            # puts `kick-vod` on your PATH
kick-vod --help
```

To remove it later: `npm unlink -g kick-vod`.

### Option 2 — run it in place

Nothing to install, nothing to build:

```bash
git clone https://github.com/SwierczKacper/kick-vod.git
cd kick-vod
node bin/kick-vod.js --help
```

---

## Usage

```
kick-vod <url|channel|uuid> [options]
```

Run it with no arguments at all and it will ask for a link or channel name.

### What you can pass as a target

| Input | What happens |
| --- | --- |
| `https://kick.com/<channel>/videos/<id>` | downloads that VOD |
| `https://kick.com/<channel>?clip=clip_xxx` | downloads that clip |
| `https://kick.com/<channel>/clips/<clip_id>` | downloads that clip |
| `<channel>` | shows an arrow-key picker over that channel's recent VODs |
| `<uuid>` | a VOD by id (old-style ids only — see [FAQ](#faq)) |

### Options

| Option | Description |
| --- | --- |
| `-q, --quality <q>` | `best` (default), `worst`, or an exact variant: `1080p60`, `720p60`, `720`, … |
| `--qualities` | list what this VOD offers, then exit |
| `-o, --output <file>` | output filename (default: `<channel> - <date> - <title>.mp4`) |
| `-d, --dir <dir>` | output directory (default: `$KICK_VOD_DIR`, otherwise the current directory) |
| `--channel-dir` | save into a per-channel subdirectory of the output directory |
| `--from <time>` | start at this position, e.g. `01:12:30` |
| `--to <time>` | stop at this position |
| `--clips` | work on the channel's clips instead of its VODs |
| `-l, --list` | print the channel's VODs/clips and exit |
| `-n, --limit <n>` | how many entries to list (default: 20) |
| `--faststart` | move the MP4 index to the front — nicer for streaming, slow on huge files |
| `-y, --yes` | skip the confirmation prompt |
| `--json` | print metadata + the direct stream URL to stdout instead of downloading |
| `--no-progress` | plain log lines instead of a progress bar (good for cron/CI) |
| `-h, --help` / `-v, --version` | help / version |

Timecodes accept `90`, `1:30`, or `01:23:45`.

### Examples

```bash
# Best available quality, into ~/Videos
kick-vod https://kick.com/xqc/videos/<id> -d ~/Videos

# Browse a channel's recent streams and pick one
kick-vod xqc

# What qualities does this VOD have?
kick-vod <url> --qualities

# A 15-minute highlight out of an 8-hour stream
kick-vod <url> --from 01:00:00 --to 01:15:00 -o highlight.mp4

# Smaller file, no questions asked
kick-vod <url> -q 720p60 --yes

# List recent VODs with their links
kick-vod xqc --list -n 10

# Grab the direct stream URL for your own tooling
kick-vod <url> --json | jq -r .sourceUrl
```

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | error (bad arguments, VOD unavailable, ffmpeg failure, …) |
| `130` | cancelled by the user (Ctrl+C, or "no" at the prompt) |

### Where files land, and what they're called

By default the file is written to the current directory, like any other CLI tool.
To have one fixed destination no matter where you run the command from, set
`KICK_VOD_DIR` once:

```bash
echo 'export KICK_VOD_DIR="$HOME/Videos/kick"' >> ~/.bashrc
```

`--dir` always overrides it, and `--channel-dir` adds a per-channel subdirectory:

```
~/Videos/kick/xmerghani/xmerghani - 2026-08-07 - LAST DANCE GTA RP.mp4
```

Filenames are built as `<channel> - <date> - <title>.mp4`. Stream titles
tend to end in a run of chat commands that describe nothing, so those are stripped,
along with exclamation marks (which upset shell history expansion) and anything a
filesystem rejects.

Accents are folded to plain ASCII, so names survive being moved between
filesystems, shells and machines: `STREAMERÓW` → `STREAMEROW`, `Łódź` → `Lodz`,
`Straße` → `Strasse`. Scripts with no ASCII equivalent — Cyrillic, Greek, CJK —
are left as they are, since folding them would destroy the name rather than
simplify it.

```
before:  LAST DANCE GTA RP - STREFA.RP [DAY 1]| !sklep !skins !holy !swap !steel
after:   xmerghani - 2026-08-07 - LAST DANCE GTA RP - STREFA.RP [DAY 1].mp4
```

---

## How it works

Four steps, no magic:

**1. Read the VOD metadata.** Kick's API is behind Cloudflare, which blocks `curl`,
Node's `fetch`, and anything whose user-agent says `HeadlessChrome`. Instead of
installing a browser-automation framework, this tool launches a Chrome you already
have with `--dump-dom` and reads the JSON straight out of the rendered page.

**2. Handle both id schemes.** Kick recently migrated VOD ids to **UUIDv7**, and the
old `api/v1/video/<id>` endpoint returns nothing for the new ones. Conveniently, the
first 48 bits of a UUIDv7 are a millisecond timestamp — and for a VOD that timestamp
is exactly the stream's start time. So when a new-style id isn't recognised, the tool
decodes that timestamp and matches it against the channel's VOD listing to find the
same stream. This is why a new-style link needs the channel in the URL.

**3. Pick a quality.** The metadata points at an HLS master playlist on Kick's CDN
(not Cloudflare-protected, so a plain `fetch` is enough). That playlist is parsed
into variants — typically 1080p60 / 720p60 / 480p30 / 360p30 / 160p30 — sorted by
bitrate, and `--quality` selects one.

**4. Download.** ffmpeg copies the chosen variant into an MP4 with `-c copy`, so
there is **no re-encoding**: bit-for-bit the same video and audio Kick served.
Progress comes from ffmpeg's `-progress pipe:1` output, and since the VOD duration
is known in advance, the percentage and ETA are real rather than guessed.

### Project layout

```
bin/kick-vod.js    entry point and top-level error handling
src/browser.js     Chrome detection + reading the Cloudflare-protected API
src/kick.js        Kick endpoints, link parsing, UUIDv7 fallback
src/hls.js         master playlist parsing and quality selection
src/ffmpeg.js      ffmpeg detection, download, progress parsing
src/prompt.js      arrow-key list picker and prompts (no dependencies)
src/cli.js         orchestration
src/args.js        argument parsing
src/ui.js          colours and formatting
src/util.js        filenames, timecodes, date handling
```

---

## Troubleshooting

**`No Chrome/Chromium installation found.`**
Install any Chromium-based browser, or set `CHROME_PATH` to one. See [Requirements](#requirements).

**`ffmpeg was not found on your PATH.`**
Install ffmpeg, or set `FFMPEG_PATH`. Note that some bundled/static ffmpeg builds
crash under WSL2 — if you hit a segfault, use your distribution's package instead.

**`The Kick API did not return JSON.` / Cloudflare challenge**
Cloudflare occasionally serves an interstitial. Wait a few seconds and retry — the
clearance cookie is cached in a temporary Chrome profile, so it usually only happens
on the first run.

**`VOD … has no playable source.`**
The stream is private, was deleted, or Kick has pruned it. If you passed a bare
new-style id, use the full link that includes the channel name instead.

**Kick CDN returns HTTP 404**
Old VODs get pruned by Kick. Nothing can be done about that.

**The download is slow**
`-c copy` means the bottleneck is your connection, not your CPU. 30–60× realtime is
typical; an 8-hour 1080p60 VOD is roughly 25–30 GB.

---

## FAQ

**Does this work on live streams?**
No — this is for finished VODs and clips.

**Does it download chat?**
No.

**Why does a bare new-style id fail?**
The UUIDv7 fallback needs to know which channel to search. Pass the full link.

**Is `--from` frame-accurate?**
No. Seeking happens at keyframe boundaries, so a cut can land a couple of seconds
off. That's the trade-off for not re-encoding — pass the file through a re-encode
afterwards if you need an exact cut.

**Can I resume an interrupted download?**
Not currently. Ctrl+C finalises the container so the partial file stays playable,
but restarting begins from the beginning (or use `--from` to skip ahead).

**Why Chrome instead of a scraping library?**
Because a library that gets through Cloudflare needs a real browser engine anyway.
Using the browser directly keeps the dependency count at zero.

---

## ⚖️ Legal & disclaimer

**This project is not affiliated with, associated with, authorised by, endorsed by,
or in any way officially connected to Kick, Kick Streaming Pty Ltd, or any of their
subsidiaries or affiliates.** The name "Kick", the Kick logo, and all related marks
are the property of their respective owners and are used here only to describe what
this software interoperates with.

**This software is provided for personal, lawful use only.** It is a convenience
wrapper around ffmpeg: it reads publicly accessible metadata and passes a publicly
accessible stream URL to ffmpeg. It contains **no DRM circumvention**, does not
bypass authentication, paywalls, subscriptions, or any access control, and cannot
access private, unlisted, or subscriber-only content.

**You are responsible for how you use it.** Before downloading anything, make sure
you have the right to do so. In particular:

- Downloading may be restricted by **Kick's Terms of Service**. Review them and
  comply with them — using this tool does not exempt you from that agreement.
- Streams are the **copyrighted work of the creators** who made them, and often
  contain third-party copyrighted material (music, games, video) as well.
- **Do not redistribute, re-upload, or monetise** downloaded content without
  permission from the rights holders.
- Personal exceptions such as private copying or fair use/fair dealing **vary by
  country** and may not cover your situation.
- Be considerate of Kick's infrastructure: don't run this in bulk or hammer it.

**No warranty.** This software is provided "as is", without warranty of any kind,
express or implied, as set out in the [LICENSE](LICENSE). The authors and
contributors accept **no liability** for any claim, damage, loss, account
suspension, or other consequence arising from its use or misuse.

**This is not legal advice.** If you are unsure whether a particular use is lawful
where you live, consult a qualified lawyer.

**Unofficial and unstable.** Kick provides no public API for this, so the tool relies
on endpoints that can change or disappear without notice — as already happened once
with the move to UUIDv7 ids. Expect occasional breakage.

If you represent Kick and would like this project changed or taken down, please open
an issue.

---

## Contributing

Issues and pull requests are welcome — especially fixes for Kick API changes.
There is no build step: clone it, edit it, run `node bin/kick-vod.js` to try it.
Please keep the project dependency-free.

Tests use the built-in Node test runner, so there is still nothing to install:

```bash
npm test
```

They cover link parsing, playlist parsing, quality selection, ffmpeg argument
construction, filename and timecode handling, and the interactive prompts. The
prompt tests run under a real pty via `script(1)` and skip themselves on
platforms without it.

Work happens on short-lived branches (`fix/…`, `feat/…`, `docs/…`) merged into
`main` through a pull request once CI is green. `main` stays releasable, and
releases are SemVer tags.

## Author

Świercz Kacper — [swierczkacper.pl](https://swierczkacper.pl)

## License

[MIT](LICENSE) © 2026 Świercz Kacper — do what you like, at your own risk, keep the notice.
