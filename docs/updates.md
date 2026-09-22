# Actualizaciones

Cómo el IDE detecta, descarga e instala una versión nueva. Publicar una release
no tiene ningún paso manual: se sube la versión con `npm run up` y el IDE la
detecta solo.

## Flujo

```
npm run up ──► tag vX.Y.Z ──► release.yml ──► GitHub Release (notas = changelog)
                                   │
                                   └──► Supabase `releases` (fila)
                                             │
                              Realtime (WebSocket, sin polling)
                                             ▼
                                          IDE ──► notificación + descarga
```

1. **`npm run up`** (en `master` limpio) calcula la siguiente versión del
   odómetro, actualiza `package.json` + `package-lock.json`, commitea, crea el
   tag `vX.Y.Z` y lo empuja.
2. El tag dispara `.github/workflows/release.yml`: empaqueta Linux (AppImage,
   deb, tar.gz) y Windows (nsis), crea el GitHub Release y registra la fila en
   Supabase.
3. El IDE recibe la fila por **Supabase Realtime** y avisa. Si la app estaba
   cerrada, hace **una** lectura al arrancar (no es polling).
4. `electron-updater` descarga el artefacto y `quitAndInstall()` reinicia la app
   con la versión nueva.

## Piezas

- **Backend**: tabla `public.releases` (`docs/backend/0019_releases.sql`),
  lectura pública, dentro de `supabase_realtime`.
- **Workflow**: lee `docs/changelog/changelog-<versión>.md` para las notas del
  release y lo inserta en Supabase (upsert por tag).
- **Main**: `src/main/app-updates.ts` (lectura + Realtime) y
  `src/main/auto-updater.ts` (electron-updater).
- **Renderer**: `src/renderer/src/services/updates` (estado) y
  `features/updates/UpdatesBridge.tsx` (avisos).
- **UI**: Ajustes → Acerca de (`Buscar actualizaciones`) y el anuncio de la
  bienvenida (con punto en **Anuncios**).

## Setup (una sola vez)

1. Aplicar `docs/backend/0019_releases.sql` en Supabase.
2. Cargar el secret del repo:

   ```bash
   gh secret set SUPABASE_SERVICE_ROLE_KEY   # Project Settings → API → service_role
   ```

   `SUPABASE_URL` es opcional (el workflow usa el proyecto por defecto).

Sin el secret, el release se publica igual y el paso de Supabase se salta con un
warning.

## Límites

- **Linux**: sólo el **AppImage** se auto-actualiza. En instalaciones deb/tar.gz
  o desde el código fuente, el aviso ofrece el enlace a la release.
- **Firma**: Windows/macOS sin certificado muestran la advertencia del sistema;
  el auto-update funciona igual.
- El primer release con updater es el que ya trae `latest*.yml`; desde ahí las
  versiones siguientes se actualizan solas.
