// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export const prompt = `Use the notes tool to work with the user's Notes: list them, read one, create a new note, update a note's content, or delete one. A note is "global" (in every project) or "project" (only the open project). The user sets per note whether the AI may read, edit or delete it — if an action is refused, do not retry: tell the user and let them grant access in the Notes panel. Prefer this over writing scratch files for things the user may want to keep as notes.`
