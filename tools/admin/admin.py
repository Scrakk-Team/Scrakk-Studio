#!/usr/bin/env python3
"""Scrakk local admin tool (Tkinter).

Small desktop utility to moderate the ``scrakk-cli`` Supabase project:

* Accounts: search ``profiles`` and toggle the ``verified`` flag.
* Extensions: search the ``extensions`` table and toggle
  ``verified`` / ``status``.

It talks straight to the PostgREST API using the *service_role* key, which is
required because a DB trigger blocks normal users from touching the admin
columns (``verified``, ``verified_at``, ``status``, ...).

The key is only ever read from the ``SCRAKK_SERVICE_ROLE_KEY`` env var and is
never printed, logged or persisted.
"""

from __future__ import annotations

import io
import os
import threading
from datetime import datetime, timezone
from typing import Any, Callable, Optional

try:  # Tkinter ships with CPython but may be packaged separately.
    import tkinter as tk
    from tkinter import messagebox, ttk
except ModuleNotFoundError as exc:  # pragma: no cover - environment dependent
    raise SystemExit(
        "ERROR: Tkinter is not available in this Python.\n"
        "On Debian/Ubuntu install it with: sudo apt install python3-tk"
    ) from exc

try:  # HTTP client (preferred)
    import httpx
except ImportError:  # pragma: no cover - handled at startup
    httpx = None  # type: ignore[assignment]

try:
    from PIL import Image, ImageTk
except ImportError:  # pragma: no cover - handled at startup
    Image = None  # type: ignore[assignment]
    ImageTk = None  # type: ignore[assignment]


DEFAULT_URL = "https://ufcwwigmzgmyyfauymim.supabase.co"
THUMB_SIZE = 44  # px, square thumbnails
SEARCH_LIMIT = 50


class Config:
    """Runtime configuration, sourced exclusively from env vars."""

    def __init__(self) -> None:
        self.url = os.environ.get("SCRAKK_SUPABASE_URL", DEFAULT_URL).rstrip("/")
        self.key = os.environ.get("SCRAKK_SERVICE_ROLE_KEY", "").strip()
        if not self.key:
            raise SystemExit(
                "ERROR: SCRAKK_SERVICE_ROLE_KEY is not set.\n"
                "Export the Supabase service_role key before running, e.g.:\n"
                "  export SCRAKK_SERVICE_ROLE_KEY='eyJ...'\n"
                "It is required to bypass RLS and set admin columns."
            )
        self.rest = f"{self.url}/rest/v1"

    def headers(self, extra: Optional[dict[str, str]] = None) -> dict[str, str]:
        # NOTE: never log this dict — it contains the secret key.
        h = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if extra:
            h.update(extra)
        return h


class ApiError(Exception):
    """Human-readable wrapper around a failed request."""


class Api:
    """Thin PostgREST client. Never exposes the key in errors."""

    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.client = httpx.Client(timeout=25)

    def _url(self, path: str) -> str:
        return f"{self.cfg.rest}{path}"

    def _handle(self, resp: "httpx.Response") -> Any:
        if resp.status_code >= 400:
            # Response bodies contain no secret; trim to keep the UI tidy.
            raise ApiError(f"HTTP {resp.status_code}: {resp.text[:400]}")
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    def get(self, path: str, params: Optional[dict[str, Any]] = None) -> Any:
        return self._handle(self.client.get(self._url(path), params=params, headers=self.cfg.headers()))

    def post(self, path: str, payload: dict[str, Any]) -> Any:
        return self._handle(self.client.post(self._url(path), json=payload, headers=self.cfg.headers()))

    def patch(self, path: str, params: dict[str, Any], payload: dict[str, Any]) -> Any:
        headers = self.cfg.headers({"Prefer": "return=minimal"})
        return self._handle(self.client.patch(self._url(path), params=params, json=payload, headers=headers))

    def get_bytes(self, url: str) -> bytes:
        resp = self.client.get(url, timeout=25)
        resp.raise_for_status()
        return resp.content


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_query(q: str) -> str:
    """Strip PostgREST filter syntax chars so user input can't break the query."""
    return q.replace(",", " ").replace("(", " ").replace(")", " ").replace("*", " ").strip()


def run_async(widget: tk.Misc, work: Callable[[], Any],
              on_ok: Callable[[Any], None], on_err: Callable[[Exception], None]) -> None:
    """Run ``work`` in a daemon thread and dispatch the result on the Tk thread."""

    def runner() -> None:
        try:
            result = work()
        except Exception as exc:  # noqa: BLE001 - surfaced in the UI
            widget.after(0, lambda: on_err(exc))
        else:
            widget.after(0, lambda: on_ok(result))

    threading.Thread(target=runner, daemon=True).start()


class ThumbnailCache:
    """Downloads and caches square PhotoImage thumbnails keyed by URL."""

    def __init__(self, api: Api, widget: tk.Misc) -> None:
        self.api = api
        self.widget = widget
        self._images: dict[str, Any] = {}
        self._placeholder = self._make_placeholder()

    def _make_placeholder(self) -> Any:
        if Image is None or ImageTk is None:
            return None
        img = Image.new("RGB", (THUMB_SIZE, THUMB_SIZE), (60, 60, 70))
        return ImageTk.PhotoImage(img)

    @property
    def placeholder(self) -> Any:
        return self._placeholder

    def get(self, url: Optional[str]) -> Any:
        """Return a cached image; schedule a download and return the placeholder."""
        if not url:
            return self._placeholder
        if url in self._images:
            return self._images[url]

        def work() -> Optional[bytes]:
            try:
                return self.api.get_bytes(url)
            except Exception:  # noqa: BLE001 - just fall back to placeholder
                return None

        def done(raw: Optional[bytes]) -> None:
            if not raw or Image is None or ImageTk is None:
                return
            try:
                img = Image.open(io.BytesIO(raw)).convert("RGB")
                img.thumbnail((THUMB_SIZE, THUMB_SIZE))
                self._images[url] = ImageTk.PhotoImage(img)
            except Exception:  # noqa: BLE001 - unsupported image format
                return

        self._images[url] = self._placeholder  # reserve slot while loading
        run_async(self.widget, work, done, lambda _e: None)
        return self._placeholder


class AccountsTab(ttk.Frame):
    """profiles search + verified toggle."""

    def __init__(self, master: tk.Misc, api: Api) -> None:
        super().__init__(master, padding=8)
        self.api = api
        self.thumbs = ThumbnailCache(api, self)
        self.rows: dict[str, dict[str, Any]] = {}
        self._build()

    def _build(self) -> None:
        top = ttk.Frame(self)
        top.pack(fill="x")
        ttk.Label(top, text="Search accounts:").pack(side="left")
        self.query = ttk.Entry(top, width=42)
        self.query.pack(side="left", padx=6)
        self.query.bind("<Return>", lambda _e: self.search())
        ttk.Button(top, text="Search", command=self.search).pack(side="left")
        ttk.Button(top, text="Verify / Unverify", command=self.toggle_verified).pack(side="left", padx=6)

        cols = ("handle", "email", "verified")
        self.tree = ttk.Treeview(self, columns=cols, show="tree headings", height=20)
        self.tree.heading("#0", text="Name")
        self.tree.heading("handle", text="Handle")
        self.tree.heading("email", text="Email")
        self.tree.heading("verified", text="✔")
        self.tree.column("#0", width=240)
        self.tree.column("handle", width=150)
        self.tree.column("email", width=240)
        self.tree.column("verified", width=40, anchor="center")
        self.tree.pack(fill="both", expand=True, pady=8)

        self.status = ttk.Label(self, text="Enter a query and press Search.")
        self.status.pack(fill="x")

    def search(self) -> None:
        q = sanitize_query(self.query.get())
        self.status.config(text="Searching…")

        def work() -> list[dict[str, Any]]:
            params: dict[str, Any] = {
                "select": "id,email,handle,display_name,avatar_url,verified,verified_at,created_at",
                "order": "created_at.desc",
                "limit": str(SEARCH_LIMIT),
            }
            if q:
                params["or"] = f"(display_name.ilike.*{q}*,handle.ilike.*{q}*,email.ilike.*{q}*)"
            return self.api.get("/profiles", params)

        run_async(self, work, self._render, self._fail)

    def _render(self, rows: list[dict[str, Any]]) -> None:
        self.tree.delete(*self.tree.get_children())
        self.rows.clear()
        for r in rows:
            rid = r["id"]
            self.rows[rid] = r
            name = r.get("display_name") or r.get("handle") or r.get("email") or rid
            self.tree.insert(
                "", "end", iid=rid, text=f"  {name}",
                image=self.thumbs.get(r.get("avatar_url")),
                values=(r.get("handle") or "—", r.get("email") or "—",
                        "✔" if r.get("verified") else ""),
            )
        self.status.config(text=f"{len(rows)} account(s). Select one and use Verify / Unverify.")

    def toggle_verified(self) -> None:
        sel = self.tree.selection()
        if not sel:
            self.status.config(text="Select an account first.")
            return
        rid = sel[0]
        row = self.rows[rid]
        new_val = not bool(row.get("verified"))
        self.status.config(text="Updating…")

        def work() -> None:
            self.api.patch(
                "/profiles", {"id": f"eq.{rid}"},
                {"verified": new_val, "verified_at": now_iso() if new_val else None},
            )

        def done(_res: Any) -> None:
            row["verified"] = new_val
            self.tree.set(rid, "verified", "✔" if new_val else "")
            self.status.config(text=f"{'Verified' if new_val else 'Unverified'} {rid}.")

        run_async(self, work, done, self._fail)

    def _fail(self, exc: Exception) -> None:
        self.status.config(text="Request failed.")
        messagebox.showerror("Accounts error", str(exc))


class ExtensionsTab(ttk.Frame):
    """search_extensions RPC + verified/status controls."""

    def __init__(self, master: tk.Misc, api: Api) -> None:
        super().__init__(master, padding=8)
        self.api = api
        self.thumbs = ThumbnailCache(api, self)
        self.rows: dict[str, dict[str, Any]] = {}
        self.owner_cache: dict[str, str] = {}
        self._build()

    def _build(self) -> None:
        top = ttk.Frame(self)
        top.pack(fill="x")
        ttk.Label(top, text="Search:").pack(side="left")
        self.query = ttk.Entry(top, width=30)
        self.query.pack(side="left", padx=6)
        self.query.bind("<Return>", lambda _e: self.search())
        ttk.Label(top, text="Category:").pack(side="left")
        self.category = ttk.Entry(top, width=16)
        self.category.pack(side="left", padx=6)
        ttk.Button(top, text="Search", command=self.search).pack(side="left")

        actions = ttk.Frame(self)
        actions.pack(fill="x", pady=6)
        ttk.Button(actions, text="Verify / Unverify", command=self.toggle_verified).pack(side="left")
        ttk.Label(actions, text="  Status:").pack(side="left")
        for status in ("published", "pending", "suspended"):
            ttk.Button(actions, text=status.capitalize(),
                       command=lambda s=status: self.set_status(s)).pack(side="left", padx=2)

        cols = ("owner", "repo", "status", "downloads", "rating", "verified")
        self.tree = ttk.Treeview(self, columns=cols, show="tree headings", height=20)
        self.tree.heading("#0", text="Name")
        for key, label in (("owner", "Owner"), ("repo", "Repo"), ("status", "Status"),
                           ("downloads", "Downloads"), ("rating", "Rating"), ("verified", "✔")):
            self.tree.heading(key, text=label)
        self.tree.column("#0", width=220)
        self.tree.column("owner", width=140)
        self.tree.column("repo", width=190)
        self.tree.column("status", width=90)
        self.tree.column("downloads", width=80, anchor="e")
        self.tree.column("rating", width=60, anchor="e")
        self.tree.column("verified", width=40, anchor="center")
        self.tree.pack(fill="both", expand=True)
        self.tree.bind("<<TreeviewSelect>>", self._on_select)

        self.status = ttk.Label(self, text="Search extensions (leave query empty to list recent).")
        self.status.pack(fill="x", pady=(6, 0))

    def search(self) -> None:
        q = sanitize_query(self.query.get())
        cat = sanitize_query(self.category.get())
        self.status.config(text="Searching…")

        params: dict[str, Any] = {
            "select": "*",
            "order": "updated_at.desc",
            "limit": str(SEARCH_LIMIT),
        }
        if q:
            params["or"] = f"(name.ilike.*{q}*,summary.ilike.*{q}*,repo_url.ilike.*{q}*)"
        if cat:
            params["categories"] = f"cs.{{{cat}}}"

        def work() -> list[dict[str, Any]]:
            # Direct table (service_role bypasses RLS) so pending/suspended are
            # visible too — you can only publish what you can find.
            return self.api.get("/extensions", params=params)

        run_async(self, work, self._render, self._fail)

    def _render(self, rows: list[dict[str, Any]]) -> None:
        self.tree.delete(*self.tree.get_children())
        self.rows.clear()
        for r in rows:
            rid = r["id"]
            self.rows[rid] = r
            owner = r.get("owner") or ""
            self.tree.insert(
                "", "end", iid=rid, text=f"  {r.get('name') or rid}",
                image=self.thumbs.get(r.get("icon_url")),
                values=(owner, f"{r.get('repo_provider', '')} · {r.get('repo_url', '')}",
                        r.get("status", ""), r.get("downloads", 0), r.get("rating_avg", 0),
                        "✔" if r.get("verified") else ""),
            )
        self.status.config(text=f"{len(rows)} extension(s).")

    def _on_select(self, _event: tk.Event) -> None:
        """Lazily resolve the owner uuid to a friendly name (cached)."""
        sel = self.tree.selection()
        if not sel:
            return
        owner = str(self.rows[sel[0]].get("owner") or "")
        if not owner or owner in self.owner_cache:
            return
        self.owner_cache[owner] = owner  # avoid duplicate fetches

        def work() -> list[dict[str, Any]]:
            return self.api.get("/profiles", {
                "select": "id,display_name,handle,email", "id": f"eq.{owner}", "limit": "1",
            })

        def done(rows: list[dict[str, Any]]) -> None:
            if not rows:
                return
            p = rows[0]
            label = p.get("display_name") or p.get("handle") or p.get("email") or owner
            self.owner_cache[owner] = label
            for rid, row in self.rows.items():
                if row.get("owner") == owner:
                    self.tree.set(rid, "owner", label)

        run_async(self, work, done, lambda _e: None)

    def _selected(self) -> Optional[dict[str, Any]]:
        sel = self.tree.selection()
        if not sel:
            self.status.config(text="Select an extension first.")
            return None
        return self.rows[sel[0]]

    def toggle_verified(self) -> None:
        row = self._selected()
        if not row:
            return
        rid = row["id"]
        new_val = not bool(row.get("verified"))
        self.status.config(text="Updating…")

        def work() -> None:
            self.api.patch(
                "/extensions", {"id": f"eq.{rid}"},
                {"verified": new_val, "verified_at": now_iso() if new_val else None},
            )

        def done(_res: Any) -> None:
            row["verified"] = new_val
            self.tree.set(rid, "verified", "✔" if new_val else "")
            self.status.config(text=f"{'Verified' if new_val else 'Unverified'} {rid}.")

        run_async(self, work, done, self._fail)

    def set_status(self, status: str) -> None:
        row = self._selected()
        if not row:
            return
        rid = row["id"]
        self.status.config(text="Updating…")

        def work() -> None:
            self.api.patch("/extensions", {"id": f"eq.{rid}"}, {"status": status})

        def done(_res: Any) -> None:
            row["status"] = status
            self.tree.set(rid, "status", status)
            self.status.config(text=f"Status set to '{status}' for {rid}.")

        run_async(self, work, done, self._fail)

    def _fail(self, exc: Exception) -> None:
        self.status.config(text="Request failed.")
        messagebox.showerror("Extensions error", str(exc))


def main() -> None:
    if httpx is None:
        raise SystemExit("ERROR: 'httpx' is required. Install it with: pip install -r requirements.txt")

    cfg = Config()  # exits early if the service key is missing
    api = Api(cfg)

    root = tk.Tk()
    root.title("Scrakk Admin")
    root.geometry("960x620")

    tabbar = ttk.Notebook(root)
    tabbar.pack(fill="both", expand=True)
    tabbar.add(AccountsTab(tabbar, api), text="Accounts")
    tabbar.add(ExtensionsTab(tabbar, api), text="Extensions")

    if Image is None:
        messagebox.showwarning("Pillow missing", "Pillow is not installed; thumbnails are disabled.")

    root.mainloop()


if __name__ == "__main__":
    main()
