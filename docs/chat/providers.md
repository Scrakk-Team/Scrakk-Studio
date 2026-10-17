---
title: "Models & providers"
group: chat
order: 60
summary: "The models.dev catalogue (refresh on open + disk cache), provider settings and keys, reasoning variants, and how the default model is chosen."
---
# Models & providers

Scrakk does not hardcode one folder per provider. The provider and model list
comes from **[models.dev](https://models.dev)** (`api.json`, MIT). The main
process fetches it (no CORS), projects it to what the UI needs, caches it on
disk, and the renderer consumes the ready list. Every provider is treated as
OpenAI-compatible: `POST {baseUrl}/chat/completions` with
`Authorization: Bearer <key>`.

## The catalogue

`src/main/models-dev/catalog.ts` fetches `https://models.dev/api.json` with a
30 s abort. `projectCatalog()` walks the raw JSON and for each provider:

- takes `baseUrl` from the provider's `api`, or from `BASE_URL_OVERRIDES` for
  SDK-only providers (OpenAI, Anthropic, Google, Mistral, xAI, Groq, …);
- keeps only models whose `modalities.output` includes `text` (or that declare
  no modalities);
- picks `defaultModel` with `pickDefaultModel()` — the **newest model that
  declares `tool_call`**, falling back to the newest;
- projects `reasoning` per model (see below);
- builds the logo URL as `https://models.dev/logos/<id>.svg` and attaches extra
  `PROVIDER_HEADERS` (OpenRouter gets `HTTP-Referer` and `X-Title`).

The projected catalogue is written to
`<userData>/models.dev.json`. `getCatalog()` returns memory → disk without
touching the network; `refreshCatalog()` forces a fetch (deduped by an in-flight
promise) and falls back to the cache on failure.

The renderer starts it once at app open (`App.tsx`):
`startProviderCatalog()` (`services/providers/catalog.ts`) loads the disk cache
first, then refreshes remotely. The registry is the single read/subscribe point:

```ts
getProviders(): ProviderConfig[]
getProvider(id: string): ProviderConfig | null
setProviderCatalog(next: ProviderConfig[]): void
subscribeProviderCatalog(listener: () => void): () => void
```

`ProviderConfig` (`@shared/modelsDev`) carries `id`, `name`, `description`,
`baseUrl`, `apiKeyUrl`, `defaultModel`, `models`, `reasoning?`, `logo` and
`headers?`.

## Settings, keys and local state

The UI is `ProvidersPanel`, embedded in **Settings → Chat → Providers**
(`chatProviders`) and reused by `ProvidersModal`. It lists the detected
providers with a search box. Selecting one lets you:

1. **Add an API key** (password input). `setApiKey` trims it, sends it to the
   main process (encrypted with `safeStorage`; memory-only without a real
   keyring) and makes that provider active; `removeApiKey` deletes it and
   deactivates the provider if it was active.
2. **Type the exact model id**. The field is prefilled with `defaultModel` and
   backed by a `datalist` of the catalogue's `models`, but any id can be typed.
3. **Choose the thinking mode** with a menu built from `thinkingOptionsFor()`.

The selection (`activeProviderId`, `models`, `thinkingModes`, `variants`) is
persisted in **localStorage** under `scrakk-studio:providers`
(`StoredProviderSettings` in `features/providers/settings.ts`). The API keys do
**not** go there: they live in `userData/secrets/api-keys.json` in the main
process, encrypted when a real keychain is available. Non-React code reads the
selection through `readProviderSettings()` and `activeProviderSelection()`;
the chat stream resolves the key in the main by `providerId`. There is no separate
"local provider" entry: all provider state is local, and any models.dev provider
with an OpenAI-compatible `api` base works without extra configuration.

## Reasoning variants

When a model declares `reasoning_options`, the projection keeps:

```ts
reasoning[modelId] = { toggle?: true, effort?: ['low', 'high', 'max'] }
```

`getAvailableVariants()` (`features/chat/commands/variants/logic.ts`) resolves
the active provider and model and returns the options: `effort` values, else
`['off','on']` for a toggle, else the heuristic `thinkingOptionsFor()` by family.
`VariantsButton` (via `EffortSlider`) and the `/variants` command apply one; it
is stored per provider in `variants` (empty string = automatic).

The chosen variant wins over the thinking mode and is translated in
`buildThinkingBody()` (`@shared/thinking`): OpenAI gets `reasoning_effort`, and
Anthropic/Gemini get `thinking: { type: 'enabled' | 'disabled' }`. The main
process merges that body into the stream request (`src/main/ipc/llm.ts`).

## Defaults

- **Model** — `getModel(providerId)` falls back to the provider's `defaultModel`
  and ignores a stored id that is no longer in `provider.models` (avoids a stale
  id that the provider rejects).
- **Thinking mode** — `'auto'` when unset or invalid.
- **Variant** — `''` (automatic) when unset.
- **API key** — the renderer only knows whether one exists; the main resolves it
  for the stream and returns a localized error if it is missing.

## Limits

- Keys are encrypted with `safeStorage` when the OS offers a real keychain
  (GNOME Keyring/KWallet/DPAPI/Keychain). With `basic_text`/no keyring they are
  **not persisted** (memory-only) — there is no plaintext fallback.
- The catalogue's base URL cannot be edited from the UI: a self-hosted endpoint
  must be exposed by models.dev or be one of `BASE_URL_OVERRIDES`.
- There is no built-in local-server provider (Ollama, LM Studio, …); the
  provider list is whatever models.dev returns.
- The disk cache can be stale; a refresh needs network access and is skipped on
  failure, keeping the previous cache.
- Model metadata outside models.dev's schema (for example a variant that is not
  a `toggle`/`effort`) is not surfaced.

## Next steps

- [Modes and permissions](permissions.md) — what the chosen model is allowed to
  do.
- [Slash commands](slash-commands.md) — `/variants` and the modal it opens.
- [Scrakk Studio documentation](../README.md) — the full documentation map.
