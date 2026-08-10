# Changelog

## 4.2.0

- **An interrupted download can be resumed.** Stop it with Ctrl+C, or lose the
  connection, and running the same command again carries on from the last piece
  it finished rather than starting the file over.
  - A stream is a playlist of ten-second pieces, and those are now fetched here
    instead of by ffmpeg, which is what makes the rest of this possible. ffmpeg
    still writes the MP4, by copying the finished local file — there is no
    re-encoding, and the result is byte-for-byte what it was before.
  - The pieces accumulate in a `.part` file next to the output, with a small
    file recording the position. Both are removed once the MP4 is written.
  - Changing the quality or the `--from` / `--to` range starts again, because
    that is a different set of pieces.
  - **Ctrl+C no longer leaves a shortened but playable MP4.** It leaves the
    `.part` file instead, and says how to continue. That is the trade for being
    able to resume at all.
- **One failed piece is retried on its own**, four times with a widening delay,
  instead of a single bad response costing the whole transfer.
- **`--connections <n>`** sets how many pieces are fetched at once, 1–16,
  default 8. Be sceptical of it: on a fast line one connection already saturates
  it, and eight measured about 11% quicker end to end here, with sixteen no
  better than eight. It helps where round trips rather than bandwidth are the
  limit. The reason to fetch pieces individually is resuming and retrying.
- `--from` no longer reads through everything before the position it was given;
  it selects the pieces that cover the range and trims the first one locally.
  Accuracy is unchanged — still keyframe-bound, as it was.

`--json`, `--list --json` and `--progress json` are unchanged in shape.
`--progress json` now updates as bytes arrive rather than once per piece, so it
keeps its roughly-twice-a-second cadence on a slow connection too.

## 4.1.0

- A clip's quality can now be chosen, where the site serves more than one. Kick
  serves a single file per clip, but Twitch offers four or so, and the largest
  was taken without asking — `--quality 720` on a clip did nothing, and
  `availableQualities` came back empty for something with four of them.
  - Clips now go through the same picker and the same `--quality` as a VOD.
  - There is less to show for them: Twitch states a height and sometimes a
    frame rate, but no width and no bitrate. Columns nothing can fill are left
    out rather than printed as "unknown", and a clip carries no size estimate
    or disk-space warning, because neither would be measured.
  - A clip served as a single file still skips the question.

## 4.0.1

Tidying up after the second site landed. Everything here is a place that still
behaved, or still read, as though there were only one.

- `--yes` now refuses an ambiguous channel name instead of stopping to ask which
  site it means. It promises no prompts, and every other prompt already honoured
  it — the README and `--help` both said this was the behaviour, so the code was
  the odd one out. Only an interactive `--yes` changes; without a terminal there
  was never a picker.
- Setting `FFMPEG_PATH` to the bundled `ffmpeg-static` binary is now recognised
  as using the bundled build. It was recorded as a system one, which suppressed
  the message explaining that these builds crash on some systems (WSL2 among
  them) and that a distribution build fixes it — so the one person who needed
  that message got a bare `killed by SIGSEGV`.
- `--qualities` no longer tells you a clip has only one quality. Twitch serves
  clips in several sizes and the largest is taken; `availableQualities` is
  empty for a clip because the quality was not chosen here, not because the site
  offers one. The README now says so, and selecting one is on the roadmap.
- The last fallback to Kick is gone. Nothing reached it — a bare channel name
  has asked which site since 4.0.0 — but the code still named a default site,
  which is the assumption the design rejected sitting where the next reader
  would take it for intent.

No change to `--json`, `--list --json` or `--progress json`.

## 4.0.0

- **Twitch is supported**, VODs and clips, from a link or a channel name. It
  needs no browser: unlike Kick there is no Cloudflare in the way, so if Twitch
  is all you use, ffmpeg is the only requirement left.
- The queries sent to Twitch are written out in full rather than sent as
  persisted queries — an operation name plus a hash of a query Twitch already
  knows. Hashes are what most tools use and they are the usual reason those
  tools break, since Twitch rotates them whenever the schema moves. This costs
  one larger request and keeps working across those changes.
- **Breaking: a bare channel name is no longer assumed to be a Kick channel.**
  A name looks the same on every site, and with two sites there is a real
  question to answer, so `any-dl somechannel` now asks which one you meant.
  Announced in 3.1.0, and this is where it lands.
  - In a terminal, a picker appears. Name the site first to skip it:
    `any-dl kick somechannel`.
  - **In a script there is nobody to ask, so it now fails** rather than
    silently downloading from the wrong site. Set `ANY_DL_PROVIDER=kick` once,
    or pass `--provider kick`, to restore the previous behaviour exactly.
  - A link is unaffected: it says which site it belongs to and always has.
- A quality is now named after its resolution rather than the playlist's
  internal group id. The two agree on Kick, but Twitch calls the source
  rendition `chunked` — which would have appeared in the picker under that
  name, and made `--quality 1080p60` miss the variant that is 1080p60.
- Fetching a playlist has a timeout. A CDN that accepted the connection and then
  went quiet used to hang the tool until it was killed.
- Error messages name the site that actually failed instead of always saying
  Kick, and `npm run smoke` covers both sites — it had been pointing at a module
  path that moved in 3.0.0, so it had not run since.

The `--json`, `--list --json` and `--progress json` shapes are unchanged, and
`schemaVersion` stays at 1. Twitch items simply arrive with `provider: "twitch"`.

## 3.2.0

- Press `c` in the channel picker to swap between a channel's VODs and its
  clips, instead of quitting and rerunning the command with `--clips`. The
  other list is fetched at that point, so nothing is downloaded up front.
- Switching to a list that turns out to be empty says so and switches back,
  rather than ending the run — the list you came from is known to have had
  something in it.
- The picker now takes optional single-key actions in general. It knows nothing
  about what they mean; the caller supplies the key, the hint shown in the
  header and the value it resolves with.

## 3.1.0

- Choosing a site is now possible without a link. Name it before the target —
  `any-dl kick somechannel` — or pass `--provider kick`, or set
  `ANY_DL_PROVIDER`. Naming it first is also how you reach a channel whose name
  happens to match a site.
- A link still decides by itself, and always wins; a link that contradicts an
  explicitly named site is refused rather than quietly overruled.
- Running the command with no arguments now asks for "a link, or a channel
  name" in one prompt, rather than asking which site first. A pasted link
  answers that question already, so most people never see it.
- When a bare name really is ambiguous, a picker appears — but only once more
  than one site is supported. With a single site the answer is known, so
  nothing is asked. Without a terminal, an ambiguous name fails with a message
  naming `--provider` instead of guessing.

## 3.0.0

- Sites are now handled by providers: one module per site under
  `src/providers/`, picked by the link's hostname. Adding a site means writing
  that module and listing it in the registry — `cli.js` no longer knows about
  any particular site. A bare channel name still goes to Kick, because nothing
  in a name says which site it belongs to; a `--provider` flag can decide that
  once there is a second one.
- The machine-readable output is normalised, and is now assembled field by
  field instead of being whatever the Kick module happened to return. That old
  approach meant each new site would have quietly renamed or widened the
  contract:
  - `uuid` is now `id`, since other sites do not use UUIDs.
  - `masterUrl` and `directUrl` no longer appear. They are how a provider
    fetches a thing, not something a caller should read. `sourceUrl` is
    unchanged and is still what you hand to a player or to ffmpeg.
  - `provider`, `webUrl` and `schemaVersion` were added. `schemaVersion` is
    bumped only when a field is removed or changes meaning, never when one is
    added.
- A link to a site that is not supported now fails saying which site it was and
  which ones are supported, instead of "Not a kick.com link".

## 2.0.0

- Renamed to any-dl. The old name described one site, and support for more is
  planned — a name that would have to be abandoned later is worse than one
  changed now, while the package is days old. Install it with
  `npm install -g any-dl`; the kick-vod package is deprecated and points here.
- The command is now `any-dl`. There is deliberately no `kick-vod` alias, so
  both packages can sit on a machine without fighting over the same name on
  PATH.
- `KICK_VOD_DIR` became `ANY_DL_DIR`. The old variable is no longer read, so a
  shell profile that sets it needs updating.
- The cached Chrome profile moved to `any-dl-chrome-profile` in the temp
  directory. The Cloudflare clearance cookie is therefore fetched once more on
  the first run after upgrading.

Nothing about what the tool does changed: the same targets, options and output
formats, including `--json`, `--list --json` and `--progress json`.

## 1.9.0

- Add --progress json, emitting NDJSON on stdout for programs driving the tool
  rather than people watching it. Nothing else is written to stdout in that
  mode, so the stream can be read line by line.
- Add --list --json, so a channel listing can be polled for new streams without
  parsing text meant for humans.
- --no-progress is now an alias for --progress none, and keeps working.

## 1.8.2

- Publish to npm automatically when a release tag is pushed, using npm trusted
  publishing over OIDC — no long-lived token is stored anywhere, and the package
  gets a provenance attestation tying it to the commit that built it. The
  workflow refuses to publish if the tag and package.json version disagree.

## 1.8.1

- Published to npm: install with npm install -g kick-vod, or run it once with
  npx kick-vod. The README leads with that rather than with cloning the repo.
- Fix the package description, which still claimed no npm dependencies — untrue
  since ffmpeg-static was added as an optional one, and visible on the npm page.
- Normalise the bin path, which npm was silently correcting on every publish.

## 1.8.0

- Add issue templates, a contributing guide and a prominent invitation in the
  README to ask for anything the tool is missing, however small.
- Document why other Kick downloaders stopped working (the UUIDv7 id change),
  since that is what people search for when theirs breaks.
- Prepare for npm: broader keywords, CHANGELOG shipped in the package, and a
  repository description that no longer claims zero dependencies.

## 1.7.1

- Drop the realtime multiple from the interactive progress display. It is
  meaningless without knowing what it measures, and the transfer rate already
  answers how fast the download is going. It still drives the ETA, and is still
  reported when output is not a terminal, where the reader is a log.

## 1.7.0

- Rework the progress display. It now shows position against the requested
  range, downloaded bytes against a projected total, and the actual transfer
  rate in MB/s — previously it reported only a position, a running total and a
  multiple of realtime, which said little about how big the file would get.
  Laid out over two lines when the terminal has room, one when it does not.
- Project the final size from bytes actually received rather than the playlist
  bitrate, so the figure sharpens as the download proceeds.
- Document the channel-name flow in the README, with the VOD picker.

## 1.6.1

- Bring the README up to date with the current flow. The sample output at the
  top still showed the pre-1.5.0 sequence, with no quality picker; it and the
  feature list, the --yes and --qualities descriptions and the exit codes now
  match what the tool does. Sample output was regenerated by running the tool.

## 1.6.0

- Check free disk space before downloading. The quality picker shows how much
  room is left and marks any variant that will not fit; if the chosen one is too
  large, the download asks for confirmation first, defaulting to no.
- Refuse outright rather than filling the disk when there is no one to ask —
  with --yes or without a terminal, insufficient space is an error, not a prompt.
  Space that cannot be determined is treated as unknown, never as empty.

## 1.5.0

- Choose the quality from a list instead of silently taking the best one. It
  shows resolution, bitrate and an estimated file size for the range being
  fetched, with the best quality preselected; picking one starts the download,
  so it replaces the separate confirmation rather than adding a step.
  Passing --quality still skips it, as do --yes and non-interactive runs.
- --qualities now includes the same size estimates.
- Fix column alignment in the pickers: the renderer collapsed runs of spaces,
  so any aligned output came out ragged.

## 1.4.0

- Answer the download prompt with a single keypress. `y` or `n` acts
  immediately; Enter still takes the default. Non-interactive runs are unchanged.

## 1.3.0

- Add a live smoke test (`npm run smoke`) that exercises the real path: reads
  the Kick API through Chrome, resolves a VOD from whichever of a few channels
  answers first, and copies ~12 seconds of the lowest quality before deleting
  it. Runs weekly in CI and on demand, deliberately not on pull requests, since
  the offline suite never touches Kick and so cannot catch an API change.
- Ship a working ffmpeg. `ffmpeg-static` is now an optional dependency, so
  `npm install` produces a tool that runs with nothing else to set up.
  A system ffmpeg still takes priority — detection order is `FFMPEG_PATH`, then
  `PATH`, then the bundled build — because the prebuilt static binaries crash on
  some systems, WSL2 among them. `npm install --omit=optional` skips the
  download entirely.
- Report a segfaulting ffmpeg as such instead of "exit code null", and point at
  installing a system build. Signals are now named in the error message.

## 1.2.0

- Drop the quality suffix from generated filenames. `[1080p60]` said nothing the
  file itself does not, and downloading one VOD at two qualities is rare enough
  that the existing " (2)" collision suffix covers it.
  Names are now `<channel> - <date> - <title>.mp4`.
- Fold accented Latin letters in filenames to plain ASCII (`STREAMERÓW` →
  `STREAMEROW`, `Łódź` → `Lodz`, `Straße` → `Strasse`), so names survive moving
  between filesystems and machines. Cyrillic, Greek and CJK are left untouched,
  having no ASCII equivalent worth substituting.
- Fail instead of reporting success when ffmpeg writes an empty file. A
  `--from`/`--to` range shorter than the gap to the next keyframe produces a
  valid but frameless MP4, and ffmpeg exits 0 for it, so `✓ Saved` was printed
  for a file containing nothing. The empty file is now removed and the error
  explains how to widen the range.
- Only pass ffmpeg's `-reconnect` options for HTTP sources. They belong to the
  HTTP protocol handler, and ffmpeg refuses to start with them for any other
  input ("Option reconnect not found").

## 1.1.0

- Clean up generated filenames. Stream titles often end in a run of chat commands
  (`!sklep !skins !holy`) that describe nothing; those are now stripped, along with
  exclamation marks, which trigger history expansion in interactive shells. Titles
  are truncated on a word boundary. Accented characters are preserved.
- Add `KICK_VOD_DIR`, a default output directory, so the command can be run from
  anywhere without landing files in the current directory. `--dir` still wins.
- Add `--channel-dir` to save into a per-channel subdirectory.

## 1.0.1

- Fix a crash at the "Start download?" prompt. The prompts built their interface
  with `createInterface` from `node:readline`, whose `question()` takes a callback
  and returns `undefined` — so awaiting it threw
  `TypeError: Cannot read properties of undefined (reading 'trim')`.
  They now use `node:readline/promises`.

## 1.0.0

First public release.

- Download Kick VODs and clips to MP4 with `-c copy` (no re-encoding)
- Best available quality by default; `--quality` accepts `best`, `worst`, an exact
  variant (`1080p60`) or a height (`720`)
- Supports both Kick id schemes, including the newer UUIDv7 links — a new-style id
  is resolved by decoding its embedded start-time timestamp and matching it against
  the channel's VOD listing
- Channel targets open an arrow-key picker; `--list` prints them instead
- Partial downloads via `--from` / `--to`
- Real progress bar with percentage and ETA, derived from the known VOD duration
- Zero npm dependencies — uses an already-installed Chrome and your own ffmpeg
- Never overwrites existing files; Ctrl+C leaves a playable MP4
