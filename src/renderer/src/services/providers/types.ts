// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Config de un proveedor de LLM.
 *
 * Ya NO se hardcodea una carpeta por proveedor: la lista sale del catálogo de
 * [models.dev](https://models.dev) (`api.json`, MIT), que el proceso main
 * descarga y proyecta. El contrato es el mismo: un proveedor OpenAI-compatible
 * (`POST {baseUrl}/chat/completions` con `Authorization: Bearer <key>`).
 */

import type { CatalogProviderConfig } from '@shared/modelsDev'

export type ProviderConfig = CatalogProviderConfig
