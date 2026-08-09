# Roadmap

What is planned, roughly in the order it is likely to happen. This is a
direction rather than a promise or a schedule, and it moves: a one-line issue
asking for something is the quickest way to push an item up the list.

Nothing here is claimed to work yet. For what does work today, see the
[README](README.md).

---

## More sites

The provider layer landed in 3.0.0, so each of these is a self-contained module
rather than surgery on the core. Twitch arrived in 4.0.0 and was the proof that
the interface holds: it needed no change to anything outside its own module.

- **YouTube** — next in line. Regular videos first, live replays if they turn
  out not to be a separate problem.
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
- **Choosing a clip's quality.** Clips are treated as having exactly one, which
  was true of the first site supported and is not true of Twitch — its clips
  come in several and the best is taken without asking.
- **Reaching content that needs an account**, such as a subscriber-only VOD.
  Currently no site is given credentials at all, which is the reason nothing
  gated is downloadable; whether that should change is a decision, not an
  oversight.

## Ideas

Not planned — things worth looking into, kept here so they are not lost. Each
needs someone to work out whether it is possible and whether it is worth doing
before it becomes anything more than a line in this section.

- **Saving a stream's chat alongside the video.** A VOD replays its chat in the
  browser, so the messages exist somewhere and can be fetched — as a file next
  to the MP4 at first, and perhaps burned into the picture later. Twitch does
  expose a replay that can be paged through; whether the other sites do, what
  format the file should take, and whether rendering chat into video belongs in
  a tool this small are all still open.

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
