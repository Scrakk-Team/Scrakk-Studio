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
    "whoosh": { "zzfx": [1.5, 0, 180, 0.02, 0.02, 0.4, 0, 1.2] },
    "wind": { "zzfx": [0.6, 0, 80, 0.04, 0.3, 1.2, 2, 0.4], "gain": 0.5, "loop": true }
  },
  "strings": { "ready": "The sky is falling tonight." },
  "timeline": [
    { "op": "audio.ambience", "sound": "wind" },
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
| `sounds` | `Record<string, EventSound>` | — | ZzFX parameter arrays (no audio files). |
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
| `motion` | object | — | `from`/`to`/`drift`/`easing` (see below). |
| `jitter` | number 0..1 | `0` | Random offset of the start point. |
| `size` | number (px) | `10` | **Drawn height** in px (1..600). |
| `rotate` | number (°) | `0` | Initial rotation, randomized ± (-360..360). |
| `flapHz` | number | `0` | Flaps per second (0..30): folds the wing horizontally, so the drawn width shrinks and grows while the body stays put. |
| `life` | number (ms) | `6000` | Lifetime of each instance (200..120000). |
| `every` | number (ms) | `0` | Stagger one instance every N ms (a "river"). |

`draw` (an `EventShape`):

| Field | Type | Default |
|---|---|---|
| `path` | SVG `<path>` `d` string (≤ 4000 chars, no `<`/`>`) | **required** |
| `viewBox` | `[width, height]` | `[1, 1]` |
| `fill` / `stroke` | color | fill `accent` |
| `width` | stroke width | `1` (≤ 32) |

`motion`:

| Field | Type | Note |
|---|---|---|
| `from` / `to` | `[x, y]` | A number is **px**; a string accepts `vw`/`vh`/`%`/`px`. |
| `drift` | `[x, y]` | Continuous drift per second, in **px/s**. |
| `easing` | `linear` \| `ease` \| `ease-in` \| `ease-out` | default `linear` |

### Audio

Audio is **synthesized**: `sounds` holds ZzFX parameter arrays, never audio
files. An op picks a key from that map.

| Op | What it does | Parameters (default) |
|---|---|---|
| `audio.play` | Plays a sound once. | `sound` **required**, `gain` 0..1 (`1`) |
| `audio.ambience` | Loops a sound as ambience. | `sound` **required**, `gain` 0..1 (`1`), `fade` ms (`800`) |
| `audio.stop` | Stops the ambience. | `fade` ms (`800`) |

```json
{
  "sounds": {
    "whoosh": { "zzfx": [1.5, 0, 180, 0.02, 0.02, 0.4, 0, 1.2] },
    "wind": { "zzfx": [0.6, 0, 80, 0.04, 0.3, 1.2, 2, 0.4], "gain": 0.5, "loop": true }
  }
}
```

| `EventSound` | Type | Default |
|---|---|---|
| `zzfx` | number[] (1..40) | **required** |
| `gain` | number 0..1 | `1` |
| `loop` | boolean | `false` |

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

A falling-meteor scene: a window in late October, a theme override, ambience, a
status chip, a notification, a driven `emit`, and a fade-out.

```json
{
  "specVersion": 1,
  "schedule": { "from": "2026-10-20", "until": "2026-10-31", "minEngine": ">=0.1.6" },
  "activation": { "mode": "notify", "once": true, "priority": 10 },
  "intensity": 0.8,
  "durationMs": 20000,
  "override": { "theme": "acme-dark" },
  "sounds": {
    "whoosh": { "zzfx": [1.5, 0, 180, 0.02, 0.02, 0.4, 0, 1.2] },
    "wind": { "zzfx": [0.6, 0, 80, 0.04, 0.3, 1.2, 2, 0.4], "gain": 0.5, "loop": true }
  },
  "strings": {
    "ready": "The sky is falling tonight.",
    "badge": "Meteor shower"
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
        "path": "M0 0 L2 0.5 L0 1 L0.5 0.5 Z",
        "viewBox": [2, 1],
        "fill": "accent",
        "stroke": "text",
        "width": 1
      },
      "count": 40,
      "size": 12,
      "every": 120,
      "life": 4000,
      "jitter": 0.3,
      "rotate": 25,
      "flapHz": 0.5,
      "motion": {
        "from": ["10%", "-5%"],
        "to": ["110%", "80%"],
        "drift": [20, 120],
        "easing": "linear"
      }
    },
    { "op": "stage.shake", "at": 2000, "intensity": 4, "duration": 500 },
    { "op": "audio.play", "at": 2000, "sound": "whoosh", "gain": 0.8 }
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
