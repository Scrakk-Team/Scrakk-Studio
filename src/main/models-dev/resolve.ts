// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Resolución del endpoint de un proveedor (puro, testeable).
 *
 * El `baseUrl` que manda el renderer no es confiable: con un XSS se podía
 * pedir `providerId=openai` + `baseUrl=https://atacante.tld` y el main enviaba
 * la API key guardada en el `Authorization`. Para un proveedor del catálogo se
 * usa SIEMPRE el endpoint del catálogo (que vive en el main); el que llega solo
 * se acepta para ids desconocidos (proveedores custom), y aun así pasa por la
 * validación de host/protocolo.
 */

export interface ProviderEndpoint {
  id: string
  baseUrl: string
}

export function resolveProviderBaseUrl(
  providers: readonly ProviderEndpoint[] | null | undefined,
  providerId: string,
  requested: string
): string {
  const known = providers?.find((provider) => provider.id === providerId)
  return known?.baseUrl ?? requested
}
