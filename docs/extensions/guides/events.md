---
title: "Events"
group: extensions
order: 150
summary: "Temporary SEF experiences: the manifest slice, the scene JSON (schedule, ops and sounds) and how the runtime activates and restores them."
---
# Events

An **event** is a temporary, self-contained experience a package turns on for a
slot of time: a Halloween scene, a launch celebration, a seasonal flourish. It is
**data**: the package declares a *scene* and the IDE's effects engine plays it.
No extension code runs.

Declared under `contributes.events`. `path` points to a JSON scene inside the
package; `scene` inlines the same object (builtins and tests, no file on disk).

```json
{
  "events": [
    { "id": "acme-meteor", "name": "Meteor shower", "path": "events/meteor.json" }
  ]
}
```

| Field | Type | Required |
|---|---|---|
| `id` | global string | yes |
| `name` | string | yes |
| `path` | path to a JSON scene in the package | one of `path`/`scene` |
| `scene` | inline scene object | one of `path`/`scene` |

Unlike [themes](themes.md), there is **no path convention**: a `path` is read
literally, and an entry with neither `path` nor `scene` is dropped with a
warning.

## The scene JSON

```json
{
  "specVersion": 1,
  "schedule": { "from": "2026-10-20", "until": "2026-10-31", "minEngine": ">=0.1.6" },
  "activation": { "mode": "notify", "once": true, "priority": 10 },
  "intensity": 0.8,
  "durationMs": 20000,
  "override": { "theme": "acme-dark" },
  "sounds": {
    "wind": { "file": "assets/viento.ogg", "gain": 0.5, "loop": true },
    "thunder": { "file": "assets/trueno.ogg" }
  },
  "strings": { "ready": "The sky is falling tonight." },
  "timeline": [
    { "op": "audio.ambience", "sound": "wind" },
    { "op": "audio.play", "at": 1200, "sound": "thunder", "gain": 0.8 },
    { "op": "notify", "at": 300, "message": "@ready" }
  ],
  "onStop": [{ "op": "audio.stop", "fade": 600 }]
}
```

| Field | Type | Default | Note |
|---|---|---|---|
| `specVersion` | number | `1` | Scene format version. Missing → warned and assumed `1`. |
| `schedule` | object | — | Activation window (see below). |
| `activation` | object | — | Mode, `once` and `priority`. |
| `intensity` | number 0..1 | `1` | Global scale applied to the ops. |
| `durationMs` | number (ms) | until the window closes | How long the event lives. |
| `override` | `{ theme? }` | — | Temporary theme applied while the event lives. |
| `sounds` | `Record<string, EventSound>` | — | Named sounds: a real `file` (jailed to the package) or ZzFX parameters. |
| `strings` | `Record<string, string>` | — | Pack-local strings, referenced as `@key`. |
| `timeline` | `EventOp[]` | **required** | The choreography. Sorted by `at`. |
| `onStop` | `EventOp[]` | — | Ops that run when the event is deactivated. |

A scene without a `timeline` (or with no valid op left after validation) is
discarded and the event is not registered. Validation is **tolerant**: one bad
op is dropped with a warning and the rest of the scene still plays.

## The activation window

`schedule` is a **window**, not a recurring date. An event is active only inside
`[from, until]`, and then it turns itself off.

```json
{ "from": "2026-10-20", "until": "2026-10-31" }
```

- `{ from: "2026-10-20", until: "2026-10-31" }` is active from **Oct 20 00:00 to
  Oct 31 23:59** and is off on Nov 1. Both bounds are inclusive.
- A bare `YYYY-MM-DD` is parsed as a **local** day on purpose (`from` = 00:00 of
  that day, `until` = the end of that day). It is **not** interpreted as UTC, so
  the window does not drift with the timezone. A full ISO string with a time is
  respected as-is.
- `minEngine` gates on the IDE version (`">=0.1.6"`, `"<2.0.0"`, `"=0.1.4"`, a
  bare `"0.1.4"`). A dev build with no known version is **fail-open**.
- With **no** `from` and **no** `until` there is no automatic activation at all:
  the event can only be started from the command palette.

```json
{ "from": "2026-12-24T18:00:00", "until": "2026-12-25T06:00:00", "minEngine": ">=0.1.6" }
```

## Activation

```json
{ "mode": "notify", "once": true, "priority": 10 }
```

| Field | Values | Default | Meaning |
|---|---|---|---|
| `mode` | `auto` \| `notify` \| `manual` | `notify` | How the event is offered inside its window. |
| `once` | boolean | `true` | Activate at most once ever (persisted). |
| `priority` | number | `0` | Higher wins when two events share a window. |

- `auto` — starts by itself as soon as the window opens.
- `notify` — a notification appears with an **Activate** action.
- `manual` — never starts on its own; only the palette command starts it.

## Ops

Every op takes `op` and an optional `at` (ms from activation, default `0`). The
timeline is sorted by `at`, so you do not have to order the JSON by hand.

### Stage

| Op | What it does | Parameters (default) |
|---|---|---|
| `stage.fog` | Two blurred radial patches over the app. | `amount` 0..1 (`0.4`), `tint` color (accent), `fade` ms (`1200`) |
| `stage.tint` | A flat color wash. | `tint` **required**, `amount` 0..1 (`0.25`), `fade` ms (`1200`) |
| `stage.vignette` | Darkens the edges. | `amount` 0..1 (`0.5`), `fade` ms (`1200`) |
| `stage.shake` | Shakes the viewport. | `intensity` px (`3`, 0..24), `duration` ms (`400`, 50..5000) |

### Particles

`emit` spawns instances of a shape. The shape is **data**: an SVG path plus a
viewBox, compiled to a `Path2D` on the canvas.

| Field | Type | Default | Note |
|---|---|---|---|
| `draw` | object | **required** | The geometry to draw (see below). |
| `count` | number | `1` | Instances per batch (1..200). |
| `motion` | object | — | `from`/`to`/`through`/`drift`/`bob`/`easing` (see below). |
| `jitter` | number 0..1 | `0` | Random offset of the **start** point. |
| `spread` | number 0..1 | `0` | Random dispersion of the **arrival** point, so a group fans out instead of stacking on one spot. |
| `bank` | number (°) | `0` | How much the shape tilts toward its direction of travel (0..60): `0` is rigid, `60` fully follows the slope. |
| `size` | number (px) | `10` | **Drawn height** in px (1..600). |
| `rotate` | number (°) | `0` | Initial rotation, randomized ± (-360..360). |
| `flapHz` | number | `0` | Flaps per second (0..30): rotates **only the wings** around the shoulder, between ±22°. The body does not move. Without a `wing` it does nothing. |
| `life` | number (ms) | `6000` | Lifetime of each instance (200..120000). |
| `every` | number (ms) | `0` | Stagger one instance every N ms. A small value (100–150) spawns a flock; a large one is a river. |

`jitter` and `spread` are not the same thing: `jitter` is **where each one
appears**, `spread` is **where each one ends**.

`draw` (an `EventShape`):

| Field | Type | Default |
|---|---|---|
| `path` | SVG `<path>` `d` string (≤ 4000 chars, no `<`/`>`) | **required** |
| `wing` | SVG `<path>` `d` string — **one** wing (the right one); the engine draws its mirror for the left | — |
| `wingAnchor` | `[x, y]` shoulder the wing rotates around, in viewBox units | viewBox centre |
| `viewBox` | `[width, height]` | `[1, 1]` |
| `fill` / `stroke` | color | fill `accent` |
| `width` | stroke width | `1` (≤ 32) |

`path` is the **body**. With `wing`, the wing is drawn twice — right and mirrored
left — and that pair is the **only** thing `flapHz` moves. With no `wing` the
whole shape is rigid: there is no flapping at all.

`motion`:

| Field | Type | Note |
|---|---|---|
| `from` / `to` | `[x, y]` | A number is **px**; a string accepts `vw`/`vh`/`%`/`px`. |
| `through` | `[x, y]` | A point the path **passes through** (a quadratic arc). Without it the engine auto-bows every instance a little, at random, so nothing travels in a perfectly straight line — a straight line reads as mechanical. |
| `drift` | `[x, y]` | Continuous drift per second, in **px/s**. |
| `bob` | number (px) | Amplitude of the vertical wander of the flight (the "flying" of the critter). Default `0`. |
| `bobHz` | number | Hz of the wander. Default `1.5`. |
| `easing` | `linear` \| `ease` \| `ease-in` \| `ease-out` | default `linear` |

### Audio

`sounds` is a map of name → sound; an op picks a name from it. A sound is
**either** a real **`file`** shipped in the package **or** a **`zzfx`** array for
the built-in synthesizer — never both.

For anything that has to sound like the real thing (a storm, thunder, a raven),
use **`file`**: a path **relative to the package root**, e.g.
`"assets/trueno.ogg"`. The runtime resolves it against the package folder —
**jailed**: no absolute paths, no `..`, so a pack cannot read audio from outside
its own folder — and reads it with its real mime type. Allowed extensions:
`.ogg`, `.oga`, `.opus`, `.mp3`, `.wav`, `.m4a`, `.webm`. The packer ships the
package's `assets/` folder, so that is the natural place to put the audio.

**`zzfx`** is the opposite: numeric parameters for **ZzFX, an 8-bit chiptune
synthesizer** — no files at all. It is the right call for a retro pack and the
wrong one for ambience: a storm rendered with ZzFX sounds like a video game.

| Op | What it does | Parameters (default) |
|---|---|---|
| `audio.play` | Plays a sound once. | `sound` **required**, `gain` 0..1 (`1`) |
| `audio.ambience` | Loops a sound as ambience. | `sound` **required**, `gain` 0..1 (`1`), `fade` ms (`800`) |
| `audio.stop` | Stops the ambience. | `fade` ms (`800`) |

```json
{
  "sounds": {
    "storm": { "file": "assets/tormenta.ogg", "gain": 0.5, "loop": true },
    "thunder": { "file": "assets/trueno.ogg" },
    "coin": { "zzfx": [1.5, 0, 180, 0.02, 0.02, 0.4, 0, 1.2] }
  }
}
```

`coin` above is the 8-bit option: ZzFX parameters, with no file involved.

| `EventSound` | Type | Default | Note |
|---|---|---|---|
| `file` | string | — | Path relative to the package root. One of `file`/`zzfx`. |
| `zzfx` | number[] (1..40) | — | ZzFX parameters (8-bit). One of `file`/`zzfx`. |
| `gain` | number 0..1 | `1` | Applies to both forms. |
| `loop` | boolean | `false` | Applies to both forms. |

When the event activates, every `file` is resolved to a `data:` URL with its real
mime and **preloaded** (decoded), so a sound scheduled at ~2 s is already ready
when its op fires — a slow (or missing) file never stalls the timeline. It is
read from the package folder, already jailed as above. `zzfx` needs no loading:
it is generated on the spot.

`sef validate` reports a sound that points at a file which is not in the package:

```
✗ sonido "thunder": el archivo no existe en el paquete
```

**Credit your audio.** If a sound comes from a source that requires attribution
(for example CC BY), the pack **must** ship a `CREDITS.md` at its root: `sef pack`
copies `CREDITS.md` and `LICENSE*` into the `.sef`. This is a legal requirement,
not a nicety.

### UI

| Op | What it does | Parameters (default) |
|---|---|---|
| `notify` | Shows a notification. | `title` / `message` (at least one; supports `@strings`), `severity` `info`\|`success`\|`warn`\|`error` (`info`) |
| `status.add` | Adds a status-bar chip (cleared when the event ends). | `text` **required** (`@strings`), `icon` productIcons id, `ttl` ms (`0`) |
| `theme.set` | Applies a registered theme. | `theme` **required** (a built-in or same-package id) |

## Colors

Every color — `draw.fill`/`stroke`, `stage.fog.tint`, `stage.tint.tint` — is
either a **theme token** or a raw CSS color.

Tokens: `accent`, `text`, `textMuted`, `textSecondary`, `border`, `bg`,
`surface`, `error`, `warning`, `success`, `info`. A token is resolved to the
live `--color-*` variable.

Raw CSS colors: `#hex` (3/4/6/8), `rgb()`/`rgba()`, `hsl()`/`hsla()` and
`transparent`. Arbitrary CSS is **not** accepted; invalid colors are dropped.

## Full example

A bat swarm at dusk: a window in late October, a theme override, ambience, a
thunder clap, a status chip, a notification, a flapping `emit` and a fade-out.
The `emit` is the
interesting part: a body-plus-wing shape with a `wingAnchor`, a group spread out
with `every`, entering from above the viewport, arcing `through` a point while
it `bob`s, fanning out with `spread` and banking into the turn.

```json
{
  "specVersion": 1,
  "schedule": { "from": "2026-10-20", "until": "2026-10-31", "minEngine": ">=0.1.6" },
  "activation": { "mode": "notify", "once": true, "priority": 10 },
  "intensity": 0.8,
  "durationMs": 20000,
  "override": { "theme": "acme-dark" },
  "sounds": {
    "wind": { "file": "assets/viento.ogg", "gain": 0.5, "loop": true },
    "thunder": { "file": "assets/trueno.ogg" }
  },
  "strings": {
    "ready": "The night is alive.",
    "badge": "Bat swarm"
  },
  "timeline": [
    { "op": "stage.vignette", "amount": 0.6, "fade": 1500 },
    { "op": "stage.tint", "tint": "accent", "amount": 0.2, "fade": 1500 },
    { "op": "audio.ambience", "sound": "wind" },
    { "op": "status.add", "text": "@badge", "icon": "zap", "ttl": 0 },
    { "op": "notify", "at": 300, "title": "Scrakk", "message": "@ready", "severity": "info" },
    {
      "op": "emit",
      "at": 1500,
      "draw": {
        "path": "M32 14 C36 14 38 20 36 26 C34 30 30 30 28 26 C26 20 28 14 32 14 Z",
        "wing": "M32 14 C40 9 52 11 60 22 C50 24 40 25 32 22 Z",
        "wingAnchor": [32, 14],
        "viewBox": [64, 40],
        "fill": "accent",
        "stroke": "text",
        "width": 1
      },
      "count": 24,
      "size": 26,
      "every": 120,
      "life": 5000,
      "jitter": 0.15,
      "spread": 0.5,
      "bank": 45,
      "rotate": 8,
      "flapHz": 8,
      "motion": {
        "from": ["45%", "-10%"],
        "to": ["55%", "105%"],
        "through": ["25%", "45%"],
        "bob": 14,
        "bobHz": 1.5,
        "easing": "linear"
      }
    },
    { "op": "stage.shake", "at": 2000, "intensity": 4, "duration": 500 },
    { "op": "audio.play", "at": 2000, "sound": "thunder", "gain": 0.8 }
  ],
  "onStop": [
    { "op": "audio.stop", "fade": 600 },
    { "op": "stage.fog", "amount": 0, "fade": 800 }
  ]
}
```

## Behaviour

- **One event at a time.** Activating another stops the current one first (and
  restores it).
- **Overrides are in memory.** `override.theme` is applied before the timeline
  (so a `theme.set` op wins) and restored exactly on exit. Nothing is persisted:
  if the app crashes mid-event, the next boot is clean — no sticky theme.
- **It turns itself off.** The event ends at whichever comes first: `durationMs`
  or the window's `until`, even if the app stays open.
- **The command overrides the window.** Activating from the palette ignores
  `from`/`until` (that is how you preview an event out of season). The automatic
  path respects the window and the `once` flag. A manual activation still records
  the event, so — outside testing mode — the automatic path will not offer it
  again.
- **`priority` breaks ties** between events whose windows overlap.

## Testing

Testing has two pieces: the **`testing-events` flag** and a **fake clock**.

With the flag on, events do not activate on their own (unless the fake clock is
set), `events.list` shows **every** event with its window status — including
expired and future ones — and the persisted state moves to a separate namespace
(`events:test:state`). That way, testing an event never "burns" its real `once`.

The **fake clock** moves "now" forward in days without touching the OS clock.
With it set, the automatic path behaves exactly like production, so you can
exercise the scheduled activation for real.

| Command | Category | What it does |
|---|---|---|
| `events.activate.<id>` | Eventos | Activate that event now, ignoring the window. One per registered event. |
| `events.stop` | Eventos | Stop the active event and restore everything. |
| `events.list` | Eventos | List the events (and, in testing, each window status). |
| `events.testing.toggle` | Eventos (testing) | Turn testing mode on/off. |
| `events.testing.clock.day` | Eventos (testing) | Move the fake clock forward 1 day. |
| `events.testing.clock.week` | Eventos (testing) | Move it forward 7 days. |
| `events.testing.clock.reset` | Eventos (testing) | Drop the fake clock (back to the real one). |
| `events.testing.state.reset` | Eventos (testing) | Clear event state (both namespaces). |

## Notes

- **Reduced motion.** With `prefers-reduced-motion: reduce`, particles and shake
  are skipped; the static fog, tint and vignette still apply.
- **Low-end mode.** The particle cap is halved in the IDE's low-end mode.
- **One canvas, hard cap.** Particles are drawn on a single canvas with a hard
  cap of 120 live instances (60 in low-end mode); the render loop only runs while
  something is animating.
- **No clicks, no layout.** The effects overlay is `pointer-events: none`, adds
  no layout, and sits below modals.

## Next steps

- [Contributes](../reference/contributes.md) — the exact manifest schema.
- [Color themes](themes.md) — the ids that `theme.set` and `override.theme` reference.
- [Manifest](../reference/manifest.md) — the rest of `manifest.json`.
