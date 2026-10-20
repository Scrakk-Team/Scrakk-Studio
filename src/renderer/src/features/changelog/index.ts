// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/** Modal de novedades (changelog de la versión instalada). */

export {
  ChangelogModal,
  maybeShowChangelogOnBoot,
  openChangelogModal,
  resetChangelogModalForTests
} from './ChangelogModal'
export type { ChangelogModalProps } from './ChangelogModal'
export {
  CHANGELOG_COMMAND_ID,
  registerChangelogCommands,
  resetChangelogCommandsForTests
} from './commands'
