// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

extern crate napi_derive;

use napi_derive::napi;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex, OnceLock};

/// Dónde vive el índice para un root. Fuera del repo para no ensuciarlo.
fn index_dir_for(root: &Path) -> PathBuf {
  let mut h: u64 = 0xcbf29ce484222325;
  let s = root.to_string_lossy();
  for b in s.bytes() {
    h ^= b as u64;
    h = h.wrapping_mul(0x100000001b3);
  }
  let base = std::env::var("XDG_CACHE_HOME")
    .map(PathBuf::from)
    .unwrap_or_else(|_| {
      let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
      PathBuf::from(home).join(".cache")
    });
  base.join("scrakk-search").join(format!("{:016x}", h))
}

fn index_fresh(index_dir: &Path, root: &Path) -> bool {
  let meta = index_dir.join("files.bin");
  if !meta.is_file() {
    return false;
  }
  // Stale si el root cambió más recientemente que el índice (heurística barata v1).
  // El watcher/incremental real viene después; por ahora rebuild bajo demanda.
  if let (Ok(idx_m), Ok(root_m)) = (
    std::fs::metadata(&meta).and_then(|m| m.modified()),
    std::fs::metadata(root).and_then(|m| m.modified()),
  ) {
    idx_m >= root_m
  } else {
    true
  }
}

/// Asegura índice trigram para `root`. Devuelve path del índice como string.
/// No falla si el build falla: el caller hace fallback a scan.
#[napi]
pub fn ensure_index(root: String) -> String {
  let root_p = Path::new(&root);
  let dir = index_dir_for(root_p);
  if index_fresh(&dir, root_p) {
    return dir.to_string_lossy().to_string();
  }
  // Build con defaults de tgrep (respeta .gitignore, skip binarios, cap 64MiB).
  let _ = tgrep_core::builder::build_index(root_p, Some(&dir), false, false, &[]);
  dir.to_string_lossy().to_string()
}

#[napi]
pub fn index_status(root: String) -> String {
  let root_p = Path::new(&root);
  let dir = index_dir_for(root_p);
  let ready = index_fresh(&dir, root_p);
  let watching = watched().lock().map(|m| m.contains_key(&root)).unwrap_or(false);
  serde_json::json!({
    "ready": ready,
    "watching": watching,
    "indexDir": dir.to_string_lossy(),
    "engine": "tgrep",
  })
  .to_string()
}

// ── Watcher incremental ────────────────────────────────────────────────────
// Un hilo fondo por proceso: registra un `notify` recursivo por root,
// debouncea ráfagas 2s y reconstruye el índice en background. Las queries
// abren el índice por mmap en cada llamada, así que ven lo nuevo sin
// reiniciar nada. Sin watcher, el rebuild síncrono de grep_files sigue
// siendo el fallback (cold start).

static WATCH_TX: OnceLock<mpsc::Sender<String>> = OnceLock::new();

fn watched() -> &'static Mutex<HashMap<String, bool>> {
  static WATCHED: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
  WATCHED.get_or_init(|| Mutex::new(HashMap::new()))
}

fn ensure_watch_thread() {
  if WATCH_TX.get().is_some() {
    return;
  }
  let (tx, rx) = mpsc::channel::<String>();
  if WATCH_TX.set(tx).is_err() {
    return;
  }
  std::thread::spawn(move || watch_loop(rx));
}

fn watch_loop(rx: mpsc::Receiver<String>) {
  use notify::{RecursiveMode, Watcher};
  use std::time::{Duration, Instant};
  let mut watchers: HashMap<String, notify::RecommendedWatcher> = HashMap::new();
  let mut pending: HashMap<String, Instant> = HashMap::new();
  loop {
    match rx.recv_timeout(Duration::from_millis(500)) {
      Ok(msg) => {
        if let Some((r, tag)) = msg.split_once('\x00') {
          if tag == "touch" {
            pending.insert(r.to_string(), Instant::now());
            continue;
          }
          if tag == "drop" {
            watchers.remove(r);
            pending.remove(r);
            continue;
          }
        }
        let root = msg;
        if !watchers.contains_key(&root) {
          let tx2 = WATCH_TX.get().cloned();
          let root2 = root.clone();
          let res: Result<notify::RecommendedWatcher, notify::Error> =
            notify::recommended_watcher(move |ev: Result<notify::Event, notify::Error>| {
              if ev.is_ok() {
                if let Some(tx) = tx2.as_ref() {
                  let _ = tx.send(format!("{root2}\x00touch"));
                }
              }
            });
          match res {
            Ok(mut w) => {
              if w.watch(Path::new(&root), RecursiveMode::Recursive).is_ok() {
                watchers.insert(root.clone(), w);
              }
            }
            Err(_) => {}
          }
        }
      }
      Err(mpsc::RecvTimeoutError::Timeout) => {}
      Err(mpsc::RecvTimeoutError::Disconnected) => break,
    }
    // Flush con 2s de quietud.
    let now = Instant::now();
    let due: Vec<String> = pending
      .iter()
      .filter(|(_, t)| now.duration_since(**t) >= Duration::from_secs(2))
      .map(|(k, _)| k.clone())
      .collect();
    for r in due {
      pending.remove(&r);
      let rp = PathBuf::from(&r);
      let dir = index_dir_for(&rp);
      let _ = tgrep_core::builder::build_index(&rp, Some(&dir), false, false, &[]);
    }
  }
}

/// Empieza a vigilar `root` (idempotente). Rebuild a los ~2s de quietud.
#[napi]
pub fn watch_root(root: String) -> String {
  ensure_watch_thread();
  if let Ok(mut w) = watched().lock() {
    w.insert(root.clone(), true);
  }
  if let Some(tx) = WATCH_TX.get() {
    let _ = tx.send(root);
  }
  serde_json::json!({"watching": true}).to_string()
}

/// Deja de vigilar `root`.
#[napi]
pub fn unwatch_root(root: String) -> String {
  if let Ok(mut w) = watched().lock() {
    w.remove(&root);
  }
  if let Some(tx) = WATCH_TX.get() {
    let _ = tx.send(format!("{root}\x00drop"));
  }
  serde_json::json!({"watching": false}).to_string()
}

/// Búsqueda de archivos por nombre (substring case-insensitive).
/// Usa `ignore` (misma semántica gitignore que tgrep) — rápida sin índice.
/// Devuelve JSON: [{path,name,isDirectory}]
#[napi]
pub fn search_files(root: String, query: String, max_results: Option<u32>) -> String {
  let max = max_results.unwrap_or(20) as usize;
  let q = query.to_lowercase();
  let mut out: Vec<serde_json::Value> = Vec::new();
  if q.is_empty() || max == 0 {
    return "[]".to_string();
  }
  let walker = ignore::WalkBuilder::new(&root)
    .hidden(true)
    .git_ignore(true)
    .git_global(true)
    .git_exclude(true)
    .require_git(false)
    .filter_entry(|e| {
      let n = e.file_name().to_string_lossy();
      n != "node_modules" && n != ".git" && n != "dist" && n != "target" && n != "out"
    })
    .build();
  for entry in walker {
    if out.len() >= max {
      break;
    }
    let Ok(entry) = entry else { continue };
    let name = entry.file_name().to_string_lossy().to_string();
    if !name.to_lowercase().contains(&q) {
      continue;
    }
    let full = entry.path();
    let rel = full
      .strip_prefix(&root)
      .map(|p| p.to_string_lossy().to_string())
      .unwrap_or(name.clone());
    let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
    out.push(serde_json::json!({"path": rel, "name": name, "isDirectory": is_dir}));
  }
  serde_json::to_string(&out).unwrap_or_else(|_| "[]".to_string())
}

/// Grep con índice trigram + verificación regex en paralelo.
/// Devuelve JSON: [{file,line,content,preview}]
#[napi]
pub fn grep_files(
  root: String,
  pattern: String,
  case_sensitive: Option<bool>,
  max_results: Option<u32>,
) -> String {
  let max = max_results.unwrap_or(50) as usize;
  let cs = case_sensitive.unwrap_or(false);
  if pattern.is_empty() || max == 0 {
    return "[]".to_string();
  }
  let root_p = Path::new(&root);
  let dir = index_dir_for(root_p);
  if !index_fresh(&dir, root_p) {
    let _ = tgrep_core::builder::build_index(root_p, Some(&dir), false, false, &[]);
  }

  // 1. Candidatos vía índice (si abre). Si no hay índice, MatchAll = todos.
  let candidates: Option<Vec<PathBuf>> = try_index_candidates(&dir, root_p, &pattern, !cs);
  // 2. Regex de verificación.
  let re = regex::RegexBuilder::new(&pattern)
    .case_insensitive(!cs)
    .build();
  let Ok(re) = re else { return "[]".to_string() };

  let files: Vec<PathBuf> = match candidates {
    Some(c) => c,
    None => walk_text_files(root_p),
  };
  use rayon::prelude::*;
  let mut hits: Vec<serde_json::Value> = files
    .par_iter()
    .flat_map(|f| grep_one_file(f, &re, max))
    .collect();
  hits.truncate(max);
  serde_json::to_string(&hits).unwrap_or_else(|_| "[]".to_string())
}

fn try_index_candidates(
  index_dir: &Path,
  root: &Path,
  pattern: &str,
  case_insensitive: bool,
) -> Option<Vec<PathBuf>> {
  let hybrid = tgrep_core::hybrid::HybridIndex::open(index_dir, root).ok()?;
  let plan = tgrep_core::query::build_query_plan(pattern, case_insensitive).ok()?;
  if plan.is_match_all() {
    return None; // sin trigramas útiles -> scan completo
  }
  let (ids, reader) = hybrid.execute_query_with_masks(&plan);
  let mut out = Vec::with_capacity(ids.len().min(5000));
  for id in ids {
    if let Some(full) = hybrid.resolve_full_path(id, &reader) {
      out.push(full);
    }
    if out.len() >= 5000 {
      break;
    }
  }
  Some(out)
}

fn walk_text_files(root: &Path) -> Vec<PathBuf> {
  let mut out = Vec::new();
  let walker = ignore::WalkBuilder::new(root)
    .hidden(true)
    .git_ignore(true)
    .git_global(true)
    .git_exclude(true)
    .require_git(false)
    .filter_entry(|e| {
      let n = e.file_name().to_string_lossy();
      n != "node_modules" && n != ".git" && n != "dist" && n != "target" && n != "out"
    })
    .build();
  for entry in walker {
    let Ok(entry) = entry else { continue };
    if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
      out.push(entry.path().to_path_buf());
    }
    if out.len() >= 20000 {
      break;
    }
  }
  out
}

fn grep_one_file(path: &Path, re: &regex::Regex, per_max: usize) -> Vec<serde_json::Value> {
  let per_max = per_max.max(1);
  let Ok(meta) = std::fs::metadata(path) else { return vec![] };
  if meta.len() > 1024 * 1024 {
    return vec![];
  }
  let Ok(content) = std::fs::read_to_string(path) else { return vec![] };
  let mut out = Vec::new();
  for (i, line) in content.lines().enumerate() {
    if re.is_match(line) {
      let trimmed = line.trim_end();
      let preview: String = trimmed.chars().take(200).collect();
      out.push(serde_json::json!({
        "file": path.to_string_lossy(),
        "line": i + 1,
        "content": trimmed,
        "preview": preview,
      }));
      if out.len() >= per_max {
        break;
      }
    }
  }
  out
}
