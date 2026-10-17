---
title: "Browser"
group: features
order: 50
summary: "The Browser panel: what it is today (a placeholder) and the real web surfaces that do exist (extension webviews and the AI web tools)."
---
# Browser

The **Browser** panel lives in the `browser` slot of the layout (opened from the
activity bar). Today it is a **placeholder**: it only sets its title and shows a
"not implemented yet" message. It is registered in `PANEL_REGISTRY` as
`browser`, and its component is
`features/layout/panels/BrowserPanel/BrowserPanel.tsx`.

```tsx
// BrowserPanel.tsx (today)
export function BrowserPanel(): JSX.Element {
  const { setTitle } = usePanelTitle()
  useEffect(() => { setTitle(t('layout.panel.browser')) }, [setTitle])
  return <div className={styles.browser}>{/* placeholder */}</div>
}
```

## What DOES exist (the real web surfaces)

The placeholder is only the *panel*. Scrakk has two real ways to show web content:

### Extension webviews

An extension with code can publish HTML and the IDE renders it in an **isolated
iframe** (`scrakk-ext://`), for both **views** (activity bar) and **webview
panels** (center tabs). See
[Views (with code)](../extensions/guides/views.md) and
[Extension Host](../extensions/architecture/extension-host.md).

### AI web tools

The agent can reach the web through two built-in tools (they run in the **main**
process, so no CORS):

- **`web_search`** — searches the web and returns title / URL / snippet.
- **`web_fetch`** — fetches a URL and returns it as **markdown**, with SSRF
  protection (blocks private, link-local, metadata and loopback by default; DNS
  is pinned to the validated IP) and long-page truncation.

See [AI tools](../chat/tools.md).

## Limits

- The **Browser panel does not browse**: it is a shell with no backend.
- The old browser tools (`open_browser`, `view_web`, `list_browser_tabs`,
  `navigate_web`) were **retired** — the agent uses `web_search`/`web_fetch`
  instead.
- For user-visible web content today, install an extension that publishes a
  webview.

## Next steps

- [Panels & features](README.md) — the other built-in panels.
- [Views (with code)](../extensions/guides/views.md) — webview views and panels.
- [AI tools](../chat/tools.md) — `web_search` and `web_fetch`.
