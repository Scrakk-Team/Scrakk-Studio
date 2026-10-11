# Scrakk Admin (local tool)

Small Tkinter desktop tool to moderate the `scrakk-cli` Supabase project. It
talks directly to PostgREST using the **service_role** key (which bypasses RLS
and the DB trigger that protects admin columns), so it is meant to run locally
only.

## Features

- **Accounts** tab: search `profiles` by name / handle / email, view a thumbnail
  of `avatar_url`, and toggle the `verified` flag (`verified_at` is set to the
  current UTC time, or cleared on unverify).
- **Extensions** tab: search via the `search_extensions` RPC (with an optional
  free-text category), view icon / repo / status / downloads / rating, toggle
  `verified`, and set `status` to `published`, `pending` or `suspended`.

## Requirements

- Python 3 (Tkinter from the stdlib — on Debian/Ubuntu you may need
  `sudo apt install python3-tk`).
- `httpx` and `Pillow`:

```bash
cd tools/admin
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Configuration (env vars)

| Variable                    | Required | Default                                        |
| --------------------------- | -------- | ---------------------------------------------- |
| `SCRAKK_SERVICE_ROLE_KEY`   | yes      | —                                              |
| `SCRAKK_SUPABASE_URL`       | no       | `https://ufcwwigmzgmyyfauymim.supabase.co`     |

The key is read only from the environment, never printed or logged.

```bash
export SCRAKK_SERVICE_ROLE_KEY='eyJ...your-service-role-key...'
# optional: export SCRAKK_SUPABASE_URL='https://ufcwwigmzgmyyfauymim.supabase.co'
python3 admin.py
```

## Notes / caveats

- The service_role key grants full access — keep it out of the repo and shell
  history.
- The `search_extensions` RPC only returns extensions whose `status` is
  `published`, so suspended/pending rows are not listed by the search. Use the
  dashboard or a direct query for those.
- The owner column shows the profile `uuid` until you select a row, at which
  point the owner name is fetched lazily (and cached).
- Network requests run on background threads; thumbnail downloads that fail
  simply fall back to a placeholder, and errors are shown in the status bar /
  a dialog instead of crashing.
