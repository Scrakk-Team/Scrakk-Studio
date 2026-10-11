// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Catálogos de traducción — ARCHIVO GENERADO por `tools/i18n.mjs`.
 *
 * `es` es la BASE (fuente de verdad, escrita a mano). Los demás idiomas se
 * generan con `--translate` y se revisan por PR. No editar a mano: corré
 * `npm run i18n -- --sync` tras agregar o quitar un área.
 */

import activitybarEs from './es/activitybar.json'
import appEs from './es/app.json'
import appearanceEs from './es/appearance.json'
import chatEs from './es/chat.json'
import commonEs from './es/common.json'
import coreEs from './es/core.json'
import explorerEs from './es/explorer.json'
import extensionviewsEs from './es/extensionviews.json'
import featuresEs from './es/features.json'
import gitEs from './es/git.json'
import greetingsEs from './es/greetings.json'
import layoutEs from './es/layout.json'
import mainEs from './es/main.json'
import marketEs from './es/market.json'
import miscEs from './es/misc.json'
import modalsEs from './es/modals.json'
import onboardingEs from './es/onboarding.json'
import paletteEs from './es/palette.json'
import providersEs from './es/providers.json'
import servicesEs from './es/services.json'
import settingsEs from './es/settings.json'
import socialEs from './es/social.json'
import statusbarEs from './es/statusbar.json'
import titlebarEs from './es/titlebar.json'
import activitybarEn from './en/activitybar.json'
import appEn from './en/app.json'
import appearanceEn from './en/appearance.json'
import chatEn from './en/chat.json'
import commonEn from './en/common.json'
import coreEn from './en/core.json'
import explorerEn from './en/explorer.json'
import extensionviewsEn from './en/extensionviews.json'
import featuresEn from './en/features.json'
import gitEn from './en/git.json'
import greetingsEn from './en/greetings.json'
import layoutEn from './en/layout.json'
import mainEn from './en/main.json'
import marketEn from './en/market.json'
import miscEn from './en/misc.json'
import modalsEn from './en/modals.json'
import onboardingEn from './en/onboarding.json'
import paletteEn from './en/palette.json'
import providersEn from './en/providers.json'
import servicesEn from './en/services.json'
import settingsEn from './en/settings.json'
import socialEn from './en/social.json'
import statusbarEn from './en/statusbar.json'
import titlebarEn from './en/titlebar.json'

export const esCatalog = { ...activitybarEs, ...appEs, ...appearanceEs, ...chatEs, ...commonEs, ...coreEs, ...explorerEs, ...extensionviewsEs, ...featuresEs, ...gitEs, ...greetingsEs, ...layoutEs, ...mainEs, ...marketEs, ...miscEs, ...modalsEs, ...onboardingEs, ...paletteEs, ...providersEs, ...servicesEs, ...settingsEs, ...socialEs, ...statusbarEs, ...titlebarEs }

export const enCatalog = { ...activitybarEn, ...appEn, ...appearanceEn, ...chatEn, ...commonEn, ...coreEn, ...explorerEn, ...extensionviewsEn, ...featuresEn, ...gitEn, ...greetingsEn, ...layoutEn, ...mainEn, ...marketEn, ...miscEn, ...modalsEn, ...onboardingEn, ...paletteEn, ...providersEn, ...servicesEn, ...settingsEn, ...socialEn, ...statusbarEn, ...titlebarEn }

export const catalogs = { es: esCatalog, en: enCatalog } as const

/** Toda clave declarada en la base. Un typo en `t('...')` no compila. */
type RawKey = keyof typeof esCatalog

/** Las claves de plural (`x.one`/`x.other`) se invocan con la clave base. */
type PluralBase<K extends string> = K extends `${infer Base}.one`
  ? Base
  : K extends `${infer Base}.other`
    ? Base
    : never

export type MessageKey = RawKey | PluralBase<RawKey & string>
