# Changelog

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
