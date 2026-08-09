# Roadmap

What is planned, roughly in the order it is likely to happen. This is a
direction rather than a promise or a schedule, and it moves: a one-line issue
asking for something is the quickest way to push an item up the list.

Nothing here is claimed to work yet. For what does work today, see the
[README](README.md).

---

## More sites

The provider layer landed in 3.0.0, so each of these is a self-contained module
rather than surgery on the core.

- **Twitch** — next in line. VODs and clips, served over HLS much like Kick, so
  it doubles as the proof that the provider interface actually holds.
- **YouTube** — regular videos first, live replays if they turn out not to be a
  separate problem.
- **Facebook** — video and reels.
- **TikTok** and **Instagram** — deliberately last. Signed requests and forced
  logins make them a different class of problem from the HLS sites, and they
  are the least forgiving about being automated.

Want one that is not listed? Ask — the order is not fixed.

## Features

- **Cutting a clip out of a VOD** more directly than `--from` / `--to` — for
  example giving a length instead of an end timestamp.
- **Resuming an interrupted download** instead of starting the file again.
- **Batch input** — a file of links, or every VOD on a channel.

## Maintenance

- Regenerate the sample output in the README whenever the display changes; it
  must come from a real run rather than being edited by hand.

## Known issues

Nothing open. If you hit something, please
[report it](https://github.com/SwierczKacper/any-dl/issues/new/choose) — Kick
has no public API and it has broken once already.

---

Requests are as welcome as code, and no request is too small or too obvious.
See [CONTRIBUTING.md](CONTRIBUTING.md).
