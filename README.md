# WhatsApp Msgstore Web Viewer

A server-side web viewer for WhatsApp `msgstore.db` (including encrypted `.crypt12/14/15`) backups. Point it at a
backup file via environment variables; the server decrypts it once at startup and serves your conversations
directly — no upload step, no client-side decryption.

## How It Works

*   You configure `WA_BACKUP_DIR` (folder containing your backup file) and, if encrypted, `WA_BACKUP_KEY_HEX`
    (your 64-character hex recovery key) as environment variables on the server.
*   On startup, the server finds the backup file, decrypts it (native `node:crypto` AES-256-GCM — fast, handles
    large files well), and opens it with `better-sqlite3`.
*   The browser only ever talks to `/api/conversations` and `/api/conversations/:id/messages` — it receives
    already-decrypted JSON, never the raw database or key.
*   This is intended for **personal, local/trusted-network use** — there's no authentication layer. Don't expose
    it to the public internet as-is.

## Features

*   **Modern UI:** A clean interface inspired by WhatsApp Web.
*   **Handles large databases:** Decryption and SQLite queries run server-side with native code, not in the
    browser — no tab freezes or memory limits on multi-hundred-MB backups.
*   **Real media:** Photos, videos, audio messages, and documents render inline (not just "Media omitted"),
    streamed directly from your backup's `Media/` folder.
*   **Contact names:** Resolves phone numbers to real contact names using `wa.db` (your synced contacts
    database) if present alongside the backup, instead of showing raw numbers everywhere.
*   **Search:** Filter conversations by contact name or phone number.
*   **Date Grouping:** Messages are intuitively grouped by "Today", "Yesterday", and specific dates.
*   **Responsive:** Works on desktop and mobile.

## Setup

1.  **Obtain your database:** a `msgstore.db` file (unencrypted) or `msgstore.db.crypt12/14/15` (encrypted).
    *   *Standard Android backups found in `WhatsApp/Databases` are usually encrypted, e.g. `msgstore.db.crypt14`.*
2.  **If encrypted, get your 64-character hex recovery key** (the E2E backup recovery key WhatsApp shows you
    when you enable end-to-end encrypted backups).
3.  **Configure and run** — point `WA_BACKUP_DIR` at the parent folder that contains your backup file (e.g. a
    `Backups/` subfolder) AND a `Media/` subfolder — the server finds the `.db`/`.crypt15` file recursively and
    auto-detects `Media/` inside the same parent. If a `wa.db`/`.crypt15` file is present too (it usually is, in
    the same `Backups/` folder), contact names are resolved automatically. See
    [Running with Docker](#running-with-docker--dockhand) below, or
    [Running Locally](#running-locally-without-docker) for a no-Docker setup.
4.  **Open the app** — it loads your conversations immediately, no upload step.

## Running with Docker / Dockhand

1.  Copy `.env.example` to `.env` in the project root and fill in:
    ```
    WA_BACKUP_HOST_DIR=/mnt/user/Docker/nextcloud/data/data/cameramanu/files/WhatsApp2/WhatsApp
    WA_BACKUP_KEY_HEX=your64characterhexkeyhere...
    ```
    That's your WhatsApp export's **parent folder** — the one containing `Backups/`, `Media/`, `Databases/`, etc.
    The server finds the `.crypt15`/`.crypt14`/`.db` file inside it automatically, and auto-detects a `Media/`
    subfolder alongside it to show real photos/videos/audio instead of "Media omitted". Leave `WA_BACKUP_KEY_HEX`
    blank if your backup isn't encrypted.

2.  Start it:
    ```bash
    docker compose up -d --build
    ```

3.  Open **http://localhost:5173/**

4.  Stop it:
    ```bash
    docker compose down
    ```

**Deploying via Dockhand ("Deploy from Git"):** point it at this repository, leave the compose file path as the
default (`docker-compose.yml`), and add `WA_BACKUP_HOST_DIR` and `WA_BACKUP_KEY_HEX` as environment variables in
Dockhand's deploy dialog. Leave scheduled sync / webhook off unless you specifically want automatic redeploys
(note: a redeploy re-runs the container, which re-decrypts the backup at startup).

Notes:
*   The image bakes in the source code and compiles `better-sqlite3`'s native addon at build time. If you pull
    new commits or change your backup file, re-run `docker compose up -d --build` to pick them up.
*   Decryption happens **once, at container startup** — not per-request — so subsequent page loads are fast.
*   Your WhatsApp folder is mounted **read-only**; your key never leaves the server (it's only used in memory
    to decrypt at startup). Media files are streamed straight from disk, unmodified.
*   By default the port binds to all interfaces (`5173:5173`). Since there's no authentication, consider
    changing this to `127.0.0.1:5173:5173` in `docker-compose.yml` if the host is reachable by others on your
    network, or put it behind a reverse proxy / VPN.
*   If `WA_BACKUP_HOST_DIR` is left unset, the container still starts (using a harmless empty placeholder
    folder), but the app will show a "Backup Not Loaded" screen until you set it and redeploy.
*   If your media lives somewhere *other* than `<WA_BACKUP_HOST_DIR>/Media` (uncommon), set `WA_MEDIA_HOST_DIR`
    in `.env` to override the auto-detected location.

## Running Locally (without Docker)

For frontend development, run the Express API and the Vite dev server side by side:

1.  **Clone and install**
    ```bash
    git clone https://github.com/trevordixon/whatsapp-msgstore-web-viewer.git
    cd whatsapp-msgstore-web-viewer
    npm install
    ```

2.  **Copy `.env.example` to `.env`** and set `WA_BACKUP_DIR` to your WhatsApp folder's path (plus `WA_BACKUP_KEY_HEX` if encrypted). `WA_MEDIA_DIR` is only needed if your media isn't in a `Media/` subfolder alongside the backup.

3.  **Start the API server** (reads `.env`, decrypts at startup, listens on port 3001 by default):
    ```bash
    npm run server:dev
    ```

4.  **In a second terminal, start the Vite dev server** (proxies `/api/*` to the server above):
    ```bash
    npm run dev
    ```

5.  Open the URL Vite prints (usually `http://localhost:5173`).

### Production build without Docker

```bash
npm run build          # builds the frontend into dist/
npm run build:server   # compiles server/ into server-dist/
npm start               # runs server-dist/index.js, serving both API and frontend on one port
```

## Environment Variables Reference

| Variable              | Where it's used        | Description                                                                 |
|------------------------|-------------------------|-------------------------------------------------------------------------------|
| `WA_BACKUP_DIR`        | Server (container path) | Parent folder to scan recursively for a `.db`/`.crypt12`/`.crypt14`/`.crypt15` file (e.g. `.../WhatsApp2/WhatsApp`) |
| `WA_MEDIA_DIR`         | Server (container path) | Optional override for the media folder. Auto-detected as `<WA_BACKUP_DIR>/Media` if unset — only set this if your media lives elsewhere |
| `WA_BACKUP_KEY_HEX`    | Server                  | 64-character hex recovery key, required only for encrypted backups           |
| `WA_BACKUP_HOST_DIR`   | Docker Compose only     | Host-side WhatsApp folder path, bind-mounted into the container at `WA_BACKUP_DIR` |
| `WA_MEDIA_HOST_DIR`    | Docker Compose only     | Optional host-side override, bind-mounted at `WA_MEDIA_DIR` — leave blank for auto-detection |
| `PORT`                 | Server                  | Port to listen on (default `5173`; `server:dev` sets this to `3001`)         |

## Encrypted Databases

*   **Supported Formats:** `.crypt15` (verified), `.crypt14`, `.crypt12`
*   **Where to find your key:**
    *   **Rooted Android:** `/data/data/com.whatsapp/files/key`
    *   **E2E-Encrypted Backups:** your 64-digit hex recovery key, shown when you enable end-to-end encrypted
        backups in WhatsApp settings.
*   Only the 64-character hex key is supported as `WA_BACKUP_KEY_HEX` — key *files* aren't read from an env var
    (there's no upload step in this version). If you only have a key file, extract the hex manually or open an
    issue if you need this supported directly.

> **Note:** Decryption is most thoroughly verified on `crypt15` files. Older formats (`crypt12`/`14`) use the
> same offsets/logic as before but are less commonly tested.

## Contact Names

WhatsApp doesn't store contact names in `msgstore.db` — only phone numbers. Names come from Android's synced
contacts database, `wa.db` (WhatsApp's own copy of it), which is typically backed up alongside `msgstore.db` in
the same `Backups/` folder (as `wa.db.crypt14`/`.crypt15`).

*   If found, it's decrypted with the same `WA_BACKUP_KEY_HEX` and its `wa_contacts` table is read once at
    startup to build a phone-number → display-name lookup.
*   Group chat names always come from the chat itself (`chat.subject`) and don't need this.
*   If `wa.db` isn't found, or a name isn't present for a given number, that conversation just shows the raw
    phone number — nothing breaks.

## Screenshots

<p align="center">
  <img src="https://github.com/user-attachments/assets/a2f878a2-e34d-47da-8a34-54f9b48b073a" alt="Landing Page" width="45%">
  &nbsp; &nbsp;
  <img src="https://github.com/user-attachments/assets/685b372c-985e-4e68-8063-3cd5d465dd2b" alt="Chat View" width="45%">
</p>

## License

Open source. Feel free to fork and improve!
