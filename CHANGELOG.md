# Changelog

## 1.3.0

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
