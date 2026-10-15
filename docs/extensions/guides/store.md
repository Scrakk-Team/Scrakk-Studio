---
title: "Extension store"
group: extensions
order: 180
summary: "Publish a .sef to the store: what it stores, the review flow, the verified mark, and how install and update work."
---
# Extension store

The store is **metadata only**: we never host your `.sef`. You point it at a
**GitHub** or **GitLab** repo and the app installs the `.sef` from that repo's
**latest release**. The listing lives in the backend, the images are uploaded,
and the package itself never touches our servers.

## Publishing

Open the **Extensions** panel → **Mine** tab → **New**, and fill in:

| Field | Notes |
|---|---|
| Name | the listing title (also used to derive the `slug`) |
| Summary / Description | one line for the card, the long text for the detail |
| Repo provider + URL | **GitHub or GitLab** only |
| Asset name | optional; if empty, the first `.sef` of the release is used |
| Categories | free text, comma separated (up to 8) |
| License | free text |
| Video | optional YouTube/Vimeo link shown as a preview |
| Icon | one image |
| Screenshots | up to **3** (besides the icon) |

Images are validated (real image bytes, ≤ 2 MB) and uploaded; you get a public
URL back.

The Save button is literally **"Submit for review"** — and that is what happens.

## Review (why it may not show up right away)

Saving stores the extension with `status = 'pending'`, and the store **only lists
`status = 'published'`**. So publishing from the panel does **not** put it in the
store yet; it appears once it is approved.

- **Editing a published extension sends it back to review.** That is on purpose:
  a change to the repo/asset is re-checked before it goes live again.
- The form now keeps a *"Saved. It stays in review…"* notice on screen so this is
  not silent.

Approval (and the **verified** mark) is done with the local admin tool:
`tools/admin/` — a small Python + Tkinter app that talks to PostgREST with the
`service_role` key (it bypasses RLS). It is **not** in the repository (gitignored).
It can set `status` to `published`, `pending` or `suspended`, and toggle
`verified`, for both extensions and accounts.

## How installing works

`install(slug)` resolves the repo's **latest release**, finds the `.sef` asset
(by name, or the first `.sef` when no name is given), downloads it and installs
it through the same path as a local `.sef`. "Not on our servers" also means the
release has to exist and be reachable.

**Auto-update:** an installed store extension gets a `.market.json` sidecar with
the slug, version and repo. On the next boot the app re-resolves the release and
reinstalls only if the version changed.

## Verified

Accounts and extensions can be **verified**; the mark is the badge next to the
name (a seal with points and the check cut out). It ships as a product icon
(`verified-badge`), so a product-icon theme can restyle or override it.

## Ratings and reports

One rating per user per extension (1–5 stars and an optional comment), and **you
cannot rate your own**. Any signed-in user can send a **report** with a reason
and a note; those rows are what the admin tool reviews.

## The official catalogue

Scrakk's own installable extensions live in one repository,
[`Scrakk-Team/extensions`](https://github.com/Scrakk-Team/extensions) — one
folder per extension and one release per extension. See
[Official extensions](official-extensions.md) for the layout, the tagging
convention and why the store resolves a release *per extension*.

## Where the data lives

| Piece | Where |
|---|---|
| Listings, ratings, reports, releases | Supabase (`extensions`, `extension_ratings`, `extension_reports`, `extension_releases`) |
| Search and categories | SQL RPCs `search_extensions` / `extension_categories` (full text; categories come from the rows, there is no hardcoded list) |
| Icons and screenshots | uploaded to R2, public URL stored on the row |
| The `.sef` itself | **your repo's release** — never ours |

Migrations: `docs/backend/0027_extensions_shop.sql`,
`0028_market_cache.sql`, `0029_social_verified.sql`. Reads use the publishable
key under RLS; writes use the signed-in account. The `service_role` key never
ships in the IDE.

## Next steps

- [Packaging](packaging.md) — build the `.sef` you publish.
- [SEF CLI](../reference/cli.md) — `sef create / build / pack / validate`.
- [Manifest](../reference/manifest.md) — what goes inside the package.
