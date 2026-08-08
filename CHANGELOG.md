# Changelog

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
