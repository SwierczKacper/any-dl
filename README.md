# kick-vod

**Download VODs and clips from [kick.com](https://kick.com) in full quality, straight to MP4.**

[![CI](https://github.com/SwierczKacper/kick-vod/actions/workflows/ci.yml/badge.svg)](https://github.com/SwierczKacper/kick-vod/actions/workflows/ci.yml)
[![Node.js 18+](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Paste a link, get the file. No re-encoding, no quality cap, **no required dependencies**.

A command-line Kick VOD downloader and clip downloader: it saves past broadcasts
at up to 1080p60, cuts a slice out of a long stream, and works from a link or
just a channel name.

```bash
kick-vod https://kick.com/somechannel/videos/019fdd44-f600-7184-bf35-ff795a9b372c
```

```
› LAST DANCE GTA RP - STREFA.RP [DAY 1]| !sklep !skins !holy !swap !steel
› 2026-08-07 19:28 · 08:07:45 · Just Chatting · 87,544 views
› File:    xmerghani - 2026-08-07 - LAST DANCE GTA RP - STREFA.RP [DAY 1].mp4

? Select quality (82.7 GB free) — ↑/↓ move, Enter select, q quit
❯ 1080p60  1920x1080  8.66 Mbps    ~29.5 GB   (recommended)
  720p60   1280x720   3.33 Mbps    ~11.4 GB
  480p30   852x480    1.34 Mbps     ~4.6 GB
  360p30   640x360    0.63 Mbps     ~2.1 GB
  160p30   284x160    0.23 Mbps   ~802.4 MB
```

Pick one with a single keypress and it starts, showing what it is actually doing:

```
  █████████░░░░░░░░░░░░░░░   35.6%   ETA 00:00:43
  00:21:22 / 01:00:00   1.2 GB / ~3.4 GB   89.0 MB/s
```

Or give it a channel name and choose from its recent streams:

```bash
kick-vod xmerghani
```

```
› Fetching VODs for xmerghani…
? Select a VOD — ↑/↓ move, Enter select, q quit
❯ LAST DANCE GTA RP - STREFA.RP [DAY 1]| !sklep !skins !holy !swap !steel  (08:07:45)
    2026-08-07 19:28 · 08:07:45 · Just Chatting · 87,544 views
  MECCHA CAMELEON NA DELEGACJI | !sklep !skins !holy !swap !steel  (01:59:29)
  WIELKI UPDATE DO GOLFA - BITWA STREAMERÓW | !sklep !skins !holy !swap !steel  (01:45:05)
  TIK-TOKI, GIVEAWAYE I ZAWIJKA | !sklep !skins !holy !swap !steel  (01:34:45)
  nowy rematch działa | !sklep !skins !holy !swap !steel  (02:37:03)
```

> **Not affiliated with Kick.** Please read [Legal & disclaimer](#️-legal--disclaimer) before use.

---

## Missing something? Just ask

**If this tool does not do something you need, [open an
issue](https://github.com/SwierczKacper/kick-vod/issues/new/choose) and it will
probably get added.** No request is too small or too obvious — a flag you
expected to exist, output you find hard to read, a step that annoys you every
time. You do not need to know how it should work, or whether it is possible.

Most of what is here came from exactly that: someone said the filenames were
ugly, or asked what a number on the progress bar meant, and it changed.

If it stops working entirely, that is worth reporting too — Kick has no public
API, and it has broken once already.

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

- **Offers every quality up to 1080p60**, with the best one preselected
- **Tells you the size before you commit**, and warns when it will not fit on disk
- **Prefers your ffmpeg**, falling back to a bundled one, so it works either way
- **No required npm dependencies** — it drives a Chrome you already have on disk
- **Real progress reporting**, because it knows the VOD duration up front
- **Grabs just a slice** of an 8-hour stream with `--from` / `--to`
- **Understands both old and new Kick links**, including the new UUIDv7 ids
- **Never overwrites** an existing file, and leaves a playable MP4 on Ctrl+C

---

## Requirements

| Tool | Why it's needed | Install |
| --- | --- | --- |
| **Node.js ≥ 18** | runtime | [nodejs.org](https://nodejs.org) |
| **ffmpeg** | downloads the HLS stream and writes the MP4 | comes with `npm install` — see below |
| **Chrome / Chromium** | Kick's API sits behind Cloudflare, which rejects non-browser clients | `apt install chromium-browser`, or any Chrome / Brave / Edge you already have |

**ffmpeg is included.** `ffmpeg-static` is an optional dependency, so a normal
install brings a working binary with it and there is nothing else to set up. A
system ffmpeg is still **preferred** when present, because the prebuilt static
builds crash on some systems — WSL2 in particular. Skip the download entirely
with `npm install --omit=optional` if you would rather use your own.

Both tools are auto-detected — including a Chrome that Puppeteer downloaded for
some other project. Override either with an environment variable:

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
npm install         # fetches the bundled ffmpeg; skip with --omit=optional
npm link            # puts `kick-vod` on your PATH
kick-vod --help
```

To remove it later: `npm unlink -g kick-vod`.

### Option 2 — run it in place

No build step, and `npm install` is only needed if you want the bundled ffmpeg:

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
| `-q, --quality <q>` | `best`, `worst`, or an exact variant: `1080p60`, `720p60`, `720`, … Omit it to pick from a list |
| `--qualities` | list what this VOD offers, with estimated sizes, then exit |
| `-o, --output <file>` | output filename (default: `<channel> - <date> - <title>.mp4`) |
| `-d, --dir <dir>` | output directory (default: `$KICK_VOD_DIR`, otherwise the current directory) |
| `--channel-dir` | save into a per-channel subdirectory of the output directory |
| `--from <time>` | start at this position, e.g. `01:12:30` |
| `--to <time>` | stop at this position |
| `--clips` | work on the channel's clips instead of its VODs |
| `-l, --list` | print the channel's VODs/clips and exit |
| `-n, --limit <n>` | how many entries to list (default: 20) |
| `--faststart` | move the MP4 index to the front — nicer for streaming, slow on huge files |
| `-y, --yes` | no prompts: takes the best quality, and fails rather than asking if it will not fit |
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
| `130` | cancelled by the user (Ctrl+C, `q` in a picker, or "no" at a prompt) |

### Choosing a quality

With no `--quality`, the download opens a list instead of silently taking the
best one — because "best" on an eight-hour stream is several gigabytes, and it is
better to know that first:

```
? Select quality — ↑/↓ move, Enter select, q quit
❯ 1080p60  1920x1080  8.66 Mbps     ~3.6 GB   (recommended)
  720p60   1280x720   3.33 Mbps     ~1.4 GB
  480p30   852x480    1.34 Mbps   ~573.6 MB
  360p30   640x360    0.63 Mbps   ~270.4 MB
  160p30   284x160    0.23 Mbps    ~98.7 MB
```

Sizes cover the range actually being fetched, so they shrink with `--from`/`--to`.
They are derived from the playlist's advertised bitrate, which is a *peak*
figure, so expect the real file to come in a few per cent under. Picking an entry
starts the download — there is no second confirmation.

Free disk space is checked against those estimates, and anything that will not
fit is called out before you commit to it:

```
? Select quality (7.8 GB free) — ↑/↓ move, Enter select, q quit
❯ 1080p60  1920x1080  8.66 Mbps    ~29.5 GB   — not enough space
  720p60   1280x720   3.33 Mbps    ~11.4 GB   — not enough space
  480p30   852x480    1.34 Mbps     ~4.6 GB
```

Choosing one of those asks for confirmation, defaulting to no. With `--yes` or no
terminal there is nobody to ask, so it fails instead of filling the disk. If the
free space cannot be read, the check is skipped rather than guessed at.

Passing `--quality` skips the list entirely, as do `--yes` and any run without a
terminal, which keeps scripts and CI working exactly as before.

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

```
  █████████░░░░░░░░░░░░░░░   35.6%   ETA 00:00:43
  00:21:22 / 01:00:00   1.2 GB / ~3.4 GB   89.0 MB/s
```

Reading left to right on the second line: how much of the requested range has
been written, how large the file is against its projected final size, and the
transfer rate. The projected size is extrapolated from bytes actually received
rather than the playlist's advertised bitrate, so it sharpens as the download
proceeds. On a terminal under 72 columns this collapses to a single compact line.

ffmpeg also reports a multiple of realtime — how many seconds of video it writes
per second of waiting. That drives the ETA but is not displayed, since it means
nothing without knowing what it measures. It does appear when output is not a
terminal, where the reader is a log rather than a person:

```
› 00:03:36 · 35.3 MB · 49.2x realtime
```

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

**`ffmpeg produced an empty file — nothing was downloaded.`**
The `--from`/`--to` range was shorter than the distance to the next keyframe.
Nothing is re-encoded, so copying can only start at a keyframe, and a range of a
few seconds can fall entirely between two of them. Ask for 10 seconds or more.

**Kick CDN returns HTTP 404**
Old VODs get pruned by Kick. Nothing can be done about that.

**The download is slow**
`-c copy` means the bottleneck is your connection, not your CPU. 30–60× realtime is
typical; an 8-hour 1080p60 VOD is roughly 25–30 GB.

---

## FAQ

**My other Kick downloader stopped working — why?**
Kick moved VOD ids to **UUIDv7** (links now look like
`019fdd44-f600-7184-bf35-ff795a9b372c` rather than
`d3498feb-7e9a-413e-a5b0-f006f3b2c902`), and the old `api/v1/video/<id>`
endpoint returns nothing for them. Tools written before that change fail on any
link copied from the browser today. This one handles both schemes — see
[How it works](#how-it-works) for the trick that makes it possible.

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
Please add no required dependencies — the only one is `ffmpeg-static`, and it is
optional precisely so the tool still works when it is absent.

Tests use the built-in Node test runner, so there is still nothing to install:

```bash
npm test
```

They cover link parsing, playlist parsing, quality selection, ffmpeg argument
construction, filename and timecode handling, and the interactive prompts. The
prompt tests run under a real pty via `script(1)` and skip themselves on
platforms without it. Everything there is offline — nothing contacts Kick.

Because of that, a separate check exercises the real thing:

```bash
npm run smoke
```

It reads the live API, resolves a VOD from whichever of a handful of channels
answers first, and copies about 12 seconds of the *lowest* quality before
deleting it. That is what catches an API move or a new id scheme. It runs weekly
in CI and can be triggered by hand, but is deliberately **not** attached to pull
requests — Kick is a third party, and its downtime should not block work here.

Work happens on short-lived branches (`fix/…`, `feat/…`, `docs/…`) merged into
`main` through a pull request once CI is green. `main` stays releasable, and
releases are SemVer tags.

## Author

Świercz Kacper — [swierczkacper.pl](https://swierczkacper.pl)

## License

[MIT](LICENSE) © 2026 Świercz Kacper — do what you like, at your own risk, keep the notice.
