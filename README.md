# WhatsApp Msgstore Web Viewer

A modern, high-performance web viewer for WhatsApp `msgstore.db` (and `msgstore.db.crypt15`) files.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Open%20App-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://trevordixon.github.io/whatsapp-msgstore-web-viewer/)

[Download the sample msgstore.db](https://github.com/trevordixon/whatsapp-msgstore-web-viewer/raw/refs/heads/main/msgstore.db) from this repository to test.

## Privacy First

**Your data never leaves your computer.** 

This application runs entirely in your browser. The database file is processed locally using WebAssembly (SQL.js). No data is uploaded to any server, ensuring your conversations remain private.

## Features

*   **Modern UI:** A clean interface inspired by WhatsApp Web.
*   **Fast & Local:** instant loading and querying of SQLite databases directly in the browser.
*   **Search:** Filter conversations by contact name or phone number.
*   **Date Grouping:** Messages are intuitively grouped by "Today", "Yesterday", and specific dates.
*   **Responsive:** Works on desktop and mobile.

## How to Use

1.  **Obtain your database:** You need a `msgstore.db` file (encrypted or unencrypted).
    *   *Note: Standard backups found in Android/WhatsApp/Databases are usually encrypted (e.g., `msgstore.db.crypt14`).*
2.  **Open the App:** Go to the [Live Demo](https://trevordixon.github.io/whatsapp-msgstore-web-viewer/).
3.  **Upload:** Click the upload box and select your `.db` file.
4.  **Browse:** Select a chat from the sidebar to view history.

## Encrypted Databases (New!)

We now support opening encrypted WhatsApp databases directly.

*   **Supported Formats:** `.crypt15` (Verified), `.crypt14`, `.crypt12`
*   **Requirements:**
    1.  The encrypted file (e.g., `msgstore.db.crypt15`)
    2.  The decryption key (e.g., `encrypted_backup.key`) **OR** your 64-character hex recovery key.
*   **Where to find the key:** 
    *   **Rooted Android:** `/data/data/com.whatsapp/files/key`
    *   **E2E-Encrypted Backups:** Use your 64-digit hex key.
*   **How to use:** Upload your `.crypt15` file, and when prompted, simply drag & drop your key file or paste the hex string.

> **Note:** Decryption is typically verified on `crypt15` files. Older formats may work but are heuristic-based.


## Screenshots

<p align="center">
  <img src="https://github.com/user-attachments/assets/a2f878a2-e34d-47da-8a34-54f9b48b073a" alt="Landing Page" width="45%">
  &nbsp; &nbsp;
  <img src="https://github.com/user-attachments/assets/685b372c-985e-4e68-8063-3cd5d465dd2b" alt="Chat View" width="45%">
</p>

## Running Locally

Pull requests are welcome! If you want to contribute or run this on your own machine:

1.  **Clone the repository**
    ```bash
    git clone https://github.com/trevordixon/whatsapp-msgstore-web-viewer.git
    cd whatsapp-msgstore-web-viewer
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Start the dev server**
    ```bash
    npm run dev
    ```

4.  **Build for production**
    ```bash
    npm run build
    ```

## Linking a Local Backup Folder (optional, dev-only)

Instead of clicking the upload box every time, you can point the app at a folder on your machine (e.g. wherever you keep your `msgstore.db` / `.crypt15` / key file exports) and open files straight from there.

1.  Copy `.env.example` to `.env` in the project root (this file is git-ignored, so your path stays local).
2.  Set `WA_BACKUP_DIR` to the folder's full path, e.g.:
    ```
    WA_BACKUP_DIR=C:\Users\YourName\Documents\WhatsAppBackup
    ```
3.  Restart `npm run dev`.
4.  On the landing screen, a "Backup folder" panel appears below the upload box, listing matching files found in that folder (recursively, a few levels deep). Click one to open it directly — no upload dialog.

Notes:
*   This only works with `npm run dev` (a small Vite dev-server middleware reads the folder). The deployed GitHub Pages demo has no backend, so it always uses the manual upload/drag-and-drop flow.
*   Files are still only read and processed locally — the middleware simply streams bytes from disk to the page on your own machine; nothing leaves your computer.
*   The panel recognizes `.db`, `.crypt12`, `.crypt14`, `.crypt15`, and files that look like decryption keys (e.g. named `key` or `*.key`).

## Running with Docker / Dockhand

This spins up the Vite **dev server** in a container — intended for occasional local use (e.g. via Dockhand), not for exposing on the internet. It keeps the backup-folder feature above working.

1.  Copy `.env.example` to `.env` in the project root and set `WA_BACKUP_HOST_DIR` to your backup folder's path (forward slashes, even on Windows):
    ```
    WA_BACKUP_HOST_DIR=C:/Users/YourName/Documents/WhatsAppBackup
    ```
    (`WA_BACKUP_DIR` in the same file is only used for running `npm run dev` directly on the host, without Docker — you can leave it blank.)

2.  Start it:
    ```bash
    docker compose up -d --build
    ```

3.  Open **http://localhost:5173/whatsapp-msgstore-web-viewer/**

4.  Stop it:
    ```bash
    docker compose down
    ```

**Deploying via Dockhand ("Deploy from Git"):** point it at this repository, leave the compose file path as the default (`docker-compose.yml`), and add `WA_BACKUP_HOST_DIR` as an environment variable in Dockhand's deploy dialog, set to the backup folder path on the host running Dockhand. Leave scheduled sync / webhook off unless you specifically want automatic redeploys.

Notes:
*   The image bakes in the source code at build time (no live-reload) — fine for occasional use. If you pull new commits or edit files, re-run `docker compose up -d --build` to pick them up.
*   By default the port binds to all interfaces (`5173:5173`); change to `127.0.0.1:5173:5173` in `docker-compose.yml` if you want it reachable only from the host machine itself.
*   Your backup folder is mounted **read-only** at `/backup` inside the container.
*   If `WA_BACKUP_HOST_DIR` is left unset, the container still starts (using a harmless empty placeholder folder) — the app will just show no linked backup files until you set it.

## License

Open source. Feel free to fork and improve!
