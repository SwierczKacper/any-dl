# any-dl

**Download videos in full quality, straight to MP4 — from a link or just a channel name.**

[![npm](https://img.shields.io/npm/v/any-dl)](https://www.npmjs.com/package/any-dl)
[![CI](https://github.com/SwierczKacper/any-dl/actions/workflows/ci.yml/badge.svg)](https://github.com/SwierczKacper/any-dl/actions/workflows/ci.yml)
[![Node.js 18+](https://img.shields.io/badge/node-%E2%89%A518-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

```bash
npm install -g any-dl
```

Paste a link, get the file. No re-encoding, no quality cap, **no required dependencies**.

**Supported sites:** [kick.com](https://kick.com) and [twitch.tv](https://twitch.tv)
— VODs and clips on both. More are planned;
[ask for one](https://github.com/SwierczKacper/any-dl/issues/new/choose).

A command-line VOD and clip downloader for Kick and Twitch: it saves past
broadcasts at up to 1080p60, cuts a slice out of a long stream, and works from a
link or just a channel name.

```bash
any-dl https://kick.com/somechannel/videos/019fdd44-f600-7184-bf35-ff795a9b372c
any-dl https://www.twitch.tv/videos/2832871456
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

Or give it a site and a channel name, and choose from that channel's recent
streams:

```bash
any-dl kick xmerghani
```

```
› Fetching VODs for xmerghani…
? Select a VOD — ↑/↓ move, Enter select, c clips, q quit
❯ REKRUTACJA NOWYCH KELENEREK - STREFA.RP [DAY 2] | !sklep !skins !holy !swap !steel  (05:01:01)
    2026-08-08 19:30 · 05:01:01 · Just Chatting · 68,603 views
  LAST DANCE GTA RP - STREFA.RP [DAY 1]| !sklep !skins !holy !swap !steel  (08:07:45)
  MECCHA CAMELEON NA DELEGACJI | !sklep !skins !holy !swap !steel  (01:59:29)
  WIELKI UPDATE DO GOLFA - BITWA STREAMERÓW | !sklep !skins !holy !swap !steel  (01:45:05)
```

Press `c` in that list to swap between the channel's VODs and its clips.

Name the site first when you are giving a channel rather than a link, since a
name on its own does not say where it lives:

```bash
any-dl twitch ewroon --list -n 3
```

```
› Fetching VODs for ewroon…
 1. [EN/ES CC]🔥MECCHA CHAMELEON MEGA LOBBY🔥!G4 !holy !flashskins VODY na !yt
    2026-07-31 19:21 · 04:12:43 · Just Chatting · 246,011 views
    https://www.twitch.tv/videos/2833699373
 2. [EN/ES CC]🔥EKIPOWY DZIEN GOLFOWY🔥!G4 !holy !flashskins VODY na !yt
    2026-07-30 19:21 · 06:05:40 · Just Chatting · 294,026 views
    https://www.twitch.tv/videos/2832871456
 3. [EN/ES CC]🔥EKIPOWY DZIEN Z QSMP🔥!G4 !holy !flashskins VODY na !yt
    2026-07-29 19:22 · 06:10:27 · Just Chatting · 327,085 views
    https://www.twitch.tv/videos/2832056864
```

> **Not affiliated with Kick or Twitch.** Please read
> [Legal & disclaimer](#️-legal--disclaimer) before use.

---

## Missing something? Just ask

**If this tool does not do something you need, [open an
issue](https://github.com/SwierczKacper/any-dl/issues/new/choose) and it will
probably get added.** No request is too small or too obvious — a flag you
expected to exist, output you find hard to read, a step that annoys you every
time. You do not need to know how it should work, or whether it is possible.

Most of what is here came from exactly that: someone said the filenames were
ugly, or asked what a number on the progress bar meant, and it changed.

What is already planned — more sites among other things — is listed in the
[roadmap](ROADMAP.md). Asking for something is the quickest way to move it up.

If it stops working entirely, that is worth reporting too — neither site offers
a public API for this, and Kick has broken once already.

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

Most existing downloaders hardcode a low quality, ship a bundled ffmpeg binary
that crashes on some systems, or install a full headless-browser framework
(150+ packages) just to read a single JSON endpoint.

This one:

- **Offers every quality up to 1080p60**, with the best one preselected
- **Tells you the size before you commit**, and warns when it will not fit on disk
- **Prefers your ffmpeg**, falling back to a bundled one, so it works either way
- **No required npm dependencies** — where a browser is needed at all, it drives
  a Chrome you already have on disk
- **Real progress reporting**, because it knows the VOD duration up front
- **Grabs just a slice** of an 8-hour stream with `--from` / `--to`
- **Understands both old and new Kick links**, including the new UUIDv7 ids
- **Reads Twitch without a browser at all**, and without the persisted-query
  hashes that break other tools whenever Twitch changes its schema
- **Never overwrites** an existing file
- **Resumes an interrupted download** — stop it with Ctrl+C, run the same
  command again, and it carries on from the piece it reached
- **Retries a single failed piece** rather than losing hours of transfer to one
  bad response

---

## Requirements

| Tool | Why it's needed | Install |
| --- | --- | --- |
| **Node.js ≥ 18** | runtime | [nodejs.org](https://nodejs.org) |
| **ffmpeg** | downloads the HLS stream and writes the MP4 | comes with `npm install` — see below |
| **Chrome / Chromium** | **Kick only.** Its API sits behind Cloudflare, which rejects non-browser clients | `apt install chromium-browser`, or any Chrome / Brave / Edge you already have |

Twitch needs no browser — its API answers an ordinary request — so if Twitch is
all you use, ffmpeg is the only thing required.

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

Two more exist: `ANY_DL_DIR` sets where downloads go — see
[Where files land](#where-files-land-and-what-theyre-called) — and
`ANY_DL_PROVIDER` answers the "which site?" question for bare channel names,
so you are not asked each time.

No Chrome anywhere on the machine? Fetch a private copy (this does **not** add a
dependency to the project — it just puts a browser on disk):

```bash
npx @puppeteer/browsers install chrome@stable
```

---

## Install

### From npm (recommended)

```bash
npm install -g any-dl
any-dl --help
```

That is everything — a working ffmpeg comes with it. Add `--omit=optional` to
skip the bundled binary and use your own. To remove it later:
`npm uninstall -g any-dl`.

Or run it once without installing anything:

```bash
npx any-dl <url>
```

### From source

For hacking on it, or if you would rather not install from a registry:

```bash
git clone https://github.com/SwierczKacper/any-dl.git
cd any-dl
npm install         # optional bundled ffmpeg
npm link            # puts `any-dl` on your PATH
```

There is no build step, so `node bin/any-dl.js --help` works straight from the
clone as well.

---

## Usage

```
any-dl <url|channel|id> [options]
```

Run it with no arguments at all and it will ask for a link or channel name.

### What you can pass as a target

| Input | What happens |
| --- | --- |
| `https://kick.com/<channel>/videos/<id>` | downloads that VOD |
| `https://kick.com/<channel>?clip=clip_xxx` | downloads that clip |
| `https://kick.com/<channel>/clips/<clip_id>` | downloads that clip |
| `https://www.twitch.tv/videos/<id>` | downloads that VOD |
| `https://www.twitch.tv/<channel>/clip/<slug>` | downloads that clip |
| `https://clips.twitch.tv/<slug>` | downloads that clip |
| `<channel>` | shows an arrow-key picker over that channel's recent VODs |
| `<id>` | a VOD by id (on Kick, old-style ids only — see [FAQ](#faq)) |

A channel page and its tabs work as targets too, so
`https://www.twitch.tv/<channel>/clips` is the same as naming the channel.

### Which site it uses

A link says which site it belongs to, so nothing needs deciding. A bare channel
name does not — `somechannel` looks the same everywhere — so it is resolved in
this order:

1. a site named before the target: `any-dl twitch somechannel`
2. `--provider twitch`
3. the `ANY_DL_PROVIDER` environment variable
4. a picker, asking which site you meant

Naming the site first is also how you reach a channel whose name happens to
match a site. Where there is nobody to ask — no terminal, or `--yes`, which
promises no prompts — a bare name fails telling you to be explicit rather than
guessing at one site and silently downloading from the wrong place. Set
`ANY_DL_PROVIDER` once if your scripts always mean the same site:

```bash
export ANY_DL_PROVIDER=twitch
```

### Options

| Option | Description |
| --- | --- |
| `-q, --quality <q>` | `best`, `worst`, or an exact variant: `1080p60`, `720p60`, `720`, … Omit it to pick from a list |
| `--qualities` | list what this VOD offers, with estimated sizes, then exit |
| `-o, --output <file>` | output filename (default: `<channel> - <date> - <title>.mp4`) |
| `-d, --dir <dir>` | output directory (default: `$ANY_DL_DIR`, otherwise the current directory) |
| `--channel-dir` | save into a per-channel subdirectory of the output directory |
| `--provider <site>` | which site to use, when a link does not already say |
| `--from <time>` | start at this position, e.g. `01:12:30` |
| `--to <time>` | stop at this position |
| `--clips` | work on the channel's clips instead of its VODs |
| `-l, --list` | print the channel's VODs/clips and exit |
| `-n, --limit <n>` | how many entries to list (default: 20) |
| `--faststart` | move the MP4 index to the front — nicer for streaming, slow on huge files |
| `--connections <n>` | how many pieces to fetch at once, 1–16 (default: 8) |
| `-y, --yes` | no prompts: takes the best quality, and fails rather than asking if it will not fit |
| `--json` | print metadata + the direct stream URL to stdout instead of downloading; with `--list`, prints the whole listing as JSON |
| `--progress <mode>` | `auto` (default), `json` for NDJSON on stdout, or `none` |
| `--no-progress` | alias for `--progress none` |
| `-h, --help` / `-v, --version` | help / version |

Timecodes accept `90`, `1:30`, or `01:23:45`.

### Examples

```bash
# Best available quality, into ~/Videos
any-dl https://kick.com/xqc/videos/<id> -d ~/Videos

# Browse a channel's recent streams and pick one
any-dl kick xqc
any-dl twitch somechannel

# What qualities does this VOD have?
any-dl <url> --qualities

# A 15-minute highlight out of an 8-hour stream
any-dl <url> --from 01:00:00 --to 01:15:00 -o highlight.mp4

# Smaller file, no questions asked
any-dl <url> -q 720p60 --yes

# List recent VODs with their links
any-dl kick xqc --list -n 10

# Grab the direct stream URL for your own tooling
any-dl <url> --json | jq -r .sourceUrl
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

Clips get the same list where the site serves more than one size. There is less
to show — Twitch states a height and sometimes a frame rate, but no width and no
bitrate, so there is nothing to estimate a size from and those columns are left
out rather than filled with "unknown":

```
? Select quality (88.7 GB free) — ↑/↓ move, Enter select, q quit
❯ 1080p   (recommended)
  720p
  480p
  360p
```

A clip served as a single file skips the question, as it always did.

Passing `--quality` skips the list entirely, as do `--yes` and any run without a
terminal, which keeps scripts and CI working exactly as before.

### Where files land, and what they're called

By default the file is written to the current directory, like any other CLI tool.
To have one fixed destination no matter where you run the command from, set
`ANY_DL_DIR` once:

```bash
echo 'export ANY_DL_DIR="$HOME/Videos/kick"' >> ~/.bashrc
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

### Driving it from another program

Three things make this usable as a backend rather than only at a prompt.

Every item, wherever it came from, is described by the same fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | bumped only when a field is removed or changes meaning |
| `provider` | which site it came from: `kick` or `twitch` |
| `kind` | `vod` or `clip` |
| `id` | the site's own identifier for the item |
| `channel` | the account it belongs to |
| `title`, `startTime`, `durationSec`, `views`, `category` | as shown in the listing |
| `webUrl` | the page a person would open |

**A channel listing as JSON**, for polling a channel for new streams:

```bash
any-dl twitch somechannel --list --json -n 5
```

Entries carry the fields above and nothing else. The stream URL is deliberately
absent: producing one means fetching every playlist, and a listing has to stay
cheap enough to poll.

**Metadata and the direct stream URL** for one VOD, without downloading:

```bash
any-dl <url> --json
```

That adds `sourceUrl`, `selectedQuality` and `availableQualities`.

Clips are described the same way. Where a site serves one in several sizes,
they are listed like a VOD's — Twitch reports a height and sometimes a frame
rate, but no width and no bitrate, so a clip carries no size estimate. A site
that serves a single file gives an empty `availableQualities` and
`"original"` as the selection.

**Progress as NDJSON on stdout**, one object per line, roughly twice a second:

```bash
any-dl <url> -q 720p60 --yes --progress json
```

```json
{"event":"progress","seconds":28.288,"totalSeconds":30,"bytes":524336,"estimatedBytes":862500,"ratio":0.94293,"speed":11.5}
```

Parse this rather than the human-readable display, which is free to change. In
`--progress json` mode nothing else is written to stdout, so the stream is safe
to read line by line. Exit codes are listed [above](#exit-codes), and errors go
to stderr.

---

## How it works

Four steps, no magic. The first differs per site; the rest are shared.

**1. Read the VOD metadata.**

*Kick* is behind Cloudflare, which blocks `curl`, Node's `fetch`, and anything
whose user-agent says `HeadlessChrome`. Instead of installing a
browser-automation framework, this tool launches a Chrome you already have with
`--dump-dom` and reads the JSON straight out of the rendered page.

*Twitch* needs none of that: its GraphQL API answers an ordinary request. The
queries are written out in full rather than sent as *persisted queries* — an
operation name plus a hash of a query Twitch already knows. Hashes are what most
tools use and they are the usual reason those tools break, because Twitch
rotates them whenever the schema moves and every client pinned to an old hash
fails on the same afternoon. Sending the query itself costs one larger request
and survives those changes.

**2. Handle each site's id scheme.** Kick migrated VOD ids to **UUIDv7**, and its
old `api/v1/video/<id>` endpoint returns nothing for the new ones. Conveniently,
the first 48 bits of a UUIDv7 are a millisecond timestamp — and for a VOD that
timestamp is exactly the stream's start time. So when a new-style id isn't
recognised, the tool decodes that timestamp and matches it against the channel's
VOD listing to find the same stream. This is why a new-style Kick link needs the
channel in the URL. Twitch has no such history: its ids are plain numbers.

**3. Pick a quality.** The metadata leads to an HLS master playlist — on Kick's
CDN directly, on Twitch via a signed playback token. Either way it is parsed
into variants (typically 1080p60 / 720p60 / 480p30 / 360p30 / 160p30), sorted by
bitrate, and `--quality` selects one. Clips are plain MP4s and skip this step.

**4. Download.** A stream is not one file: it is a playlist of ten-second pieces.
Those pieces are fetched here — several at once, written strictly in order — and
ffmpeg is then handed the finished local file to copy into an MP4 with `-c copy`,
so there is **no re-encoding**: bit-for-bit the same video and audio the site
served. Because the pieces are fetched here rather than by ffmpeg, a download can
stop and be resumed, one bad response costs one piece instead of the whole
transfer, and `--from` picks the right pieces instead of reading through
everything before them.

The pieces accumulate in a `.part` file beside the output, along with a small
file recording how far it got. Both disappear once the MP4 is written; if the
download stops, both stay, and running the same command again continues from
there. Progress is the count of what has been written against the duration you
asked for, so the percentage and ETA are real rather than guessed.

```
  █████████░░░░░░░░░░░░░░░   35.6%   ETA 00:00:43
  00:21:22 / 01:00:00   1.2 GB / ~3.4 GB   89.0 MB/s
```

When the last piece has arrived, the local file is copied into its MP4 container
and the working files are removed:

```
› Combining 49 parts…
✓ Saved xqc - 2026-08-10 - LIVE DRAMA NEWS VIDEOS GAMES REACTS.mp4 (78.5 MB)
```

Reading left to right on the second line: how much of the requested range has
been written, how large the file is against its projected final size, and the
transfer rate. The projected size is extrapolated from bytes actually received
rather than the playlist's advertised bitrate, so it sharpens as the download
proceeds. On a terminal under 72 columns this collapses to a single compact line.

There is also a multiple of realtime — how many seconds of video arrive per
second of waiting. That drives the ETA but is not displayed, since it means
nothing without knowing what it measures. It does appear when output is not a
terminal, where the reader is a log rather than a person:

```
› 00:03:36 · 35.3 MB · 49.2x realtime
```

### Project layout

```
bin/any-dl.js           entry point and top-level error handling
src/providers/          one module per supported site, plus the registry
src/providers/kick.js   Kick endpoints, link parsing, UUIDv7 fallback
src/providers/twitch.js Twitch GraphQL, link parsing, playback tokens
src/contract.js         the machine-readable output shapes, built explicitly
src/http.js             plain HTTP, for everything that needs no browser
src/browser.js          Chrome detection + reading the Cloudflare-protected API
src/hls.js              master playlist parsing and quality selection
src/segments.js         media playlist parsing and range selection
src/downloader.js       fetching segments, in order, with resume and retry
src/ffmpeg.js          ffmpeg detection, remux, progress parsing
src/prompt.js          arrow-key list picker and prompts (no dependencies)
src/cli.js             orchestration
src/args.js            argument parsing
src/ui.js              colours and formatting
src/util.js            filenames, timecodes, date handling
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
on the first run. Twitch is unaffected: it needs no browser at all.

**`VOD … has no playable source.`**
The stream is private, was deleted, or Kick has pruned it. If you passed a bare
new-style id, use the full link that includes the channel name instead.

**`Twitch has no video …`**
It was deleted, or it expired — Twitch keeps VODs for a limited time, and for
non-partnered channels that is a fortnight.

**`Twitch will not play video …`**
The VOD is subscriber-only. This tool uses no account and bypasses no access
control, so there is nothing to be done about it here.

**`ffmpeg produced an empty file — nothing was downloaded.`**
The `--from`/`--to` range was shorter than the distance to the next keyframe.
Nothing is re-encoded, so copying can only start at a keyframe, and a range of a
few seconds can fall entirely between two of them. Ask for 10 seconds or more.

**The CDN returns HTTP 404**
Old VODs get pruned. Nothing can be done about that.

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
No. It is on the [roadmap](ROADMAP.md) as an idea worth investigating, not as
something promised.

**Why is 1080p the highest Twitch quality I see?**
Because that is what Twitch offers to a viewer who is not signed in. Anything
above it is gated behind an account, and this tool deliberately uses none.

**Why does a Twitch download have silent stretches?**
Twitch mutes sections of a VOD when it detects copyrighted music. The audio is
already gone from what it serves, so nothing downstream can recover it.

**Why are Twitch clips listed by views rather than by date?**
It is the only ordering Twitch's clips endpoint reliably accepts — it is also
what its own clips tab shows. Each entry still displays its date.

**Why does a bare new-style id fail?**
The UUIDv7 fallback needs to know which channel to search. Pass the full link.
This is a Kick quirk; Twitch ids are plain numbers and work bare.

**A bare channel name now asks which site — can I stop that?**
Yes: name the site (`any-dl twitch somechannel`), or set `ANY_DL_PROVIDER` once.
The question only exists because a name genuinely does not say where it lives.

**Is `--from` frame-accurate?**
No. Seeking happens at keyframe boundaries, so a cut can land a couple of seconds
off. That's the trade-off for not re-encoding — pass the file through a re-encode
afterwards if you need an exact cut.

**Can I resume an interrupted download?**
Yes. Ctrl+C leaves a `.part` file beside the output and tells you so; run the
same command again and it continues from the last piece it finished, re-fetching
at most a couple of seconds. Change the quality or the `--from` / `--to` range
and it starts again, because that is a different set of pieces.

**Does `--connections` make it faster?**
Sometimes, and less than you would hope. On a fast line one connection already
saturates it — eight was about 11% quicker end to end in testing here, and
sixteen was no better than eight. It earns its keep where round trips rather
than bandwidth are the limit. The reason to fetch pieces individually is
resuming and retrying, not speed; `--connections 1` is a perfectly reasonable
setting.

**Why Chrome instead of a scraping library?**
Because a library that gets through Cloudflare needs a real browser engine anyway.
Using the browser directly keeps the dependency count at zero. It is only used
for the sites that require it — Kick today — and never for Twitch.

---

## ⚖️ Legal & disclaimer

**This project is not affiliated with, associated with, authorised by, endorsed by,
or in any way officially connected to Kick, Kick Streaming Pty Ltd, Twitch, Twitch
Interactive, Inc., Amazon, or any of their subsidiaries or affiliates.** The names
"Kick" and "Twitch", their logos, and all related marks are the property of their
respective owners and are used here only to describe what this software
interoperates with.

**This software is provided for personal, lawful use only.** It is a convenience
wrapper around ffmpeg: it reads publicly accessible metadata and passes a publicly
accessible stream URL to ffmpeg. It contains **no DRM circumvention**, does not
bypass authentication, paywalls, subscriptions, or any access control, and cannot
access private, unlisted, or subscriber-only content.

**You are responsible for how you use it.** Before downloading anything, make sure
you have the right to do so. In particular:

- Downloading may be restricted by **the Terms of Service of the site you are
  downloading from**. Review them and comply with them — using this tool does
  not exempt you from that agreement.
- Streams are the **copyrighted work of the creators** who made them, and often
  contain third-party copyrighted material (music, games, video) as well.
- **Do not redistribute, re-upload, or monetise** downloaded content without
  permission from the rights holders.
- Personal exceptions such as private copying or fair use/fair dealing **vary by
  country** and may not cover your situation.
- Be considerate of the site's infrastructure: don't run this in bulk or hammer it.

**No warranty.** This software is provided "as is", without warranty of any kind,
express or implied, as set out in the [LICENSE](LICENSE). The authors and
contributors accept **no liability** for any claim, damage, loss, account
suspension, or other consequence arising from its use or misuse.

**This is not legal advice.** If you are unsure whether a particular use is lawful
where you live, consult a qualified lawyer.

**Unofficial and unstable.** Neither site provides a public API for this, so the tool
relies on endpoints that can change or disappear without notice — as already happened
once with Kick's move to UUIDv7 ids. Expect occasional breakage.

If you represent either site and would like this project changed or taken down,
please open an issue.

---

## Contributing

Issues and pull requests are welcome — especially fixes for API changes at either
site, and new sites: adding one means writing a single module, and
[CONTRIBUTING.md](CONTRIBUTING.md) walks through it.
There is no build step: clone it, edit it, run `node bin/any-dl.js` to try it.
Please add no required dependencies — the only one is `ffmpeg-static`, and it is
optional precisely so the tool still works when it is absent.

Tests use the built-in Node test runner, so there is still nothing to install:

```bash
npm test
```

They cover link parsing, playlist parsing, quality selection, ffmpeg argument
construction, filename and timecode handling, and the interactive prompts. The
prompt tests run under a real pty via `script(1)` and skip themselves on
platforms without it. Everything there is offline — nothing contacts either site.

Because of that, a separate check exercises the real thing:

```bash
npm run smoke
```

It reads the live API, resolves a VOD from whichever of a handful of channels
answers first, and copies about 12 seconds of the *lowest* quality before
deleting it. That is what catches an API move or a new id scheme. It runs weekly
in CI and can be triggered by hand, but is deliberately **not** attached to pull
requests — both sites are third parties, and their downtime should not block work
here.

Work happens on short-lived branches (`fix/…`, `feat/…`, `docs/…`) merged into
`main` through a pull request once CI is green. `main` stays releasable, and
releases are SemVer tags.

## Author

Świercz Kacper — [swierczkacper.pl](https://swierczkacper.pl)

## License

[MIT](LICENSE) © 2026 Świercz Kacper — do what you like, at your own risk, keep the notice.
