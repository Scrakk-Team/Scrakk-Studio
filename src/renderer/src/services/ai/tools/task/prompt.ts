// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export const prompt =
  'task(subagent_type, prompt): launch a subagent in isolation and get its result. ' +
  'Use it to parallelize independent searches, isolate heavy reading (delegate many ' +
  'file reads and get only the synthesis), or do read-only code discovery. ' +
  'The subagent does NOT see this conversation: its prompt is the whole briefing.'
