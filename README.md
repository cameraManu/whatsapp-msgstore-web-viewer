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
*   **Search:** Filter conversations by contact name or phone number.
*   **Date Grouping:** Messages are intuitively grouped by "Today", "Yesterday", and specific dates.
*   **Responsive:** Works on desktop and mobile.

## Setup

1.  **Obtain your database:** a `msgstore.db` file (unencrypted) or `msgstore.db.crypt12/14/15` (encrypted).
    *   *Standard Android backups found in `WhatsApp/Databases` are usually encrypted, e.g. `msgstore.db.crypt14`.*
2.  **If encrypted, get your 64-character hex recovery key** (the E2E backup recovery key WhatsApp shows you
    when you enable end-to-end encrypted backups).
3.  **Configure and run** — see [Running with Docker](#running-with-docker--dockhand) below, or
    [Running Locally](#running-locally-without-docker) for a no-Docker setup.
4.  **Open the app** — it loads your conversations immediately, no upload step.

## Running with Docker / Dockhand

1.  Copy `.env.example` to `.env` in the project root and fill in:
    ```
    WA_BACKUP_HOST_DIR=C:/Users/YourName/Documents/WhatsAppBackup
    WA_BACKUP_KEY_HEX=your64characterhexkeyhere...
    ```
    (forward slashes for the path, even on Windows; leave `WA_BACKUP_KEY_HEX` blank if your backup isn't encrypted)

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
*   Your backup folder is mounted **read-only** at `/backup` inside the container; your key never leaves the
    server (it's only used in memory to decrypt at startup).
*   By default the port binds to all interfaces (`5173:5173`). Since there's no authentication, consider
    changing this to `127.0.0.1:5173:5173` in `docker-compose.yml` if the host is reachable by others on your
    network, or put it behind a reverse proxy / VPN.
*   If `WA_BACKUP_HOST_DIR` is left unset, the container still starts (using a harmless empty placeholder
    folder), but the app will show a "Backup Not Loaded" screen until you set it and redeploy.

## Running Locally (without Docker)

For frontend development, run the Express API and the Vite dev server side by side:

1.  **Clone and install**
    ```bash
    git clone https://github.com/trevordixon/whatsapp-msgstore-web-viewer.git
    cd whatsapp-msgstore-web-viewer
    npm install
    ```

2.  **Copy `.env.example` to `.env`** and set `WA_BACKUP_DIR` (and `WA_BACKUP_KEY_HEX` if encrypted).

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
| `WA_BACKUP_DIR`        | Server (container path) | Folder to scan for a `.db`/`.crypt12`/`.crypt14`/`.crypt15` file             |
| `WA_BACKUP_KEY_HEX`    | Server                  | 64-character hex recovery key, required only for encrypted backups           |
| `WA_BACKUP_HOST_DIR`   | Docker Compose only     | Host-side folder path, bind-mounted into the container at `WA_BACKUP_DIR`    |
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

## Screenshots

<p align="center">
  <img src="https://github.com/user-attachments/assets/a2f878a2-e34d-47da-8a34-54f9b48b073a" alt="Landing Page" width="45%">
  &nbsp; &nbsp;
  <img src="https://github.com/user-attachments/assets/685b372c-985e-4e68-8063-3cd5d465dd2b" alt="Chat View" width="45%">
</p>

## License

Open source. Feel free to fork and improve!
