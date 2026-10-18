// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Runtime ESM que se sirve DENTRO del iframe aislado de una extensión.
 *
 * El bundle importa `react`, `react-dom` y `react/jsx-runtime` como bare
 * specifiers; el import map del iframe los apunta todos a este archivo. React
 * corre con su PROPIA copia en el origen `scrakk-ext://`, sin compartir el
 * árbol del IDE ni `window.api`.
 *
 * React 19 se publica como CJS (`export =`), así que los named exports se
 * declaran explícitamente: un `export *` sólo dejaba el default y los bundles
 * fallaban con "does not provide an export named useState".
 */

import React from 'react'
import ReactDOM from 'react-dom'
import * as JsxRuntime from 'react/jsx-runtime'
import * as JsxDevRuntime from 'react/jsx-dev-runtime'
import { createRoot, hydrateRoot } from 'react-dom/client'

export default React

export const {
  Activity,
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  act,
  cache,
  cacheSignal,
  captureOwnerStack,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version
} = React

export const {
  createPortal,
  flushSync,
  preconnect,
  prefetchDNS,
  preinit,
  preinitModule,
  preload,
  preloadModule,
  requestFormReset,
  unstable_batchedUpdates,
  useFormState,
  useFormStatus
} = ReactDOM

export { createRoot, hydrateRoot }
export const jsx = JsxRuntime.jsx
export const jsxs = JsxRuntime.jsxs
export const jsxDEV = JsxDevRuntime.jsxDEV
