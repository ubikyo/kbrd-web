import { api } from "./client";

const BACKUP_URL = "/api/backup";

/**
 * Where the backup downloads from — a ZIP holding the database and every
 * media file. A plain link rather than a `fetch`: KBRD-API answers with
 * `Content-Disposition: attachment` and its own
 * `kbrd-backup-<date>-<time>.zip` name, so the browser saves the archive
 * and names it without the app having to build a blob to hand it.
 */
export const BACKUP_DOWNLOAD_URL = BACKUP_URL;

/**
 * Replaces the database and the media library with `file`'s. Everything on
 * the device becomes whatever the backup held — there is no undo, so the
 * Settings modal asks before calling this.
 *
 * `headers: {}` on purpose: `api` sends JSON by default, and a multipart
 * body has to be left to the browser, which is the only thing that can
 * write the boundary into the content type.
 */
export const restoreBackup = (file: File) => {
  const body = new FormData();
  body.append("file", file);
  return api<{ ok: boolean }>(`${BACKUP_URL}/restore`, {
    method: "POST",
    headers: {},
    body,
  });
};
