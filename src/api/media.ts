import { api } from "./client";
import type { MediaCategoryData, MediaData } from "../types/media";

const CATEGORY_URL = "/api/media-category";
const MEDIA_URL = "/api/media";

/** Everything the library holds, oldest first — the panel filters it by
 * kind and category itself. */
export const listMedias = () => api<MediaData[]>(MEDIA_URL);

export const listMediaCategories = () =>
  api<MediaCategoryData[]>(CATEGORY_URL);

// A name already taken by another category is refused by KBRD-API (409),
// which `api` turns into a thrown `Error` carrying its message — see
// `Media`, which shows it on the editor's own Name field rather than
// closing the modal.
export const createMediaCategory = (name: string) =>
  api<MediaCategoryData>(CATEGORY_URL, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const updateMediaCategory = (id: number, name: string) =>
  api<MediaCategoryData>(`${CATEGORY_URL}/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });

export const deleteMediaCategory = (id: number) =>
  api<{ ok: boolean }>(`${CATEGORY_URL}/${id}`, { method: "DELETE" });

/**
 * Sends one file and hands back whatever KBRD-API answers with — the one
 * thing this file does on `XMLHttpRequest` rather than `fetch`: only XHR
 * reports how much of a *request body* has gone out (`upload.progress`),
 * which is what the Media panel's own tiles show while a file is being
 * sent. `fetch` has no equivalent.
 */
function sendFile<T>(
  method: "POST" | "PUT",
  url: string,
  body: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onProgress?.(Math.round((event.loaded / event.total) * 100));
    });

    request.addEventListener("load", () => {
      // KBRD-API answers JSON either way — `{filename}` on 201, `{error}`
      // on anything else (see `api/client`, which reads the same shape).
      let data: unknown = null;
      try {
        data = JSON.parse(request.responseText) as unknown;
      } catch {
        // Left null — the status line below says enough.
      }
      const message =
        data && typeof data === "object" && "error" in data
          ? String(data.error)
          : `HTTP ${request.status}`;
      if (request.status >= 200 && request.status < 300) {
        resolve(data as T);
      } else {
        reject(new Error(message));
      }
    });

    request.addEventListener("error", () =>
      reject(new Error("The upload could not be sent")),
    );
    request.addEventListener("abort", () =>
      reject(new Error("The upload was cancelled")),
    );

    request.open(method, url);
    request.send(body);
  });
}

/**
 * Stores one image or video under `categoryId` and hands back the library
 * record that was created — see KBRD-API's own `upload_media`, which
 * checks the extension and the declared type against `ACCEPTED_MEDIA` and
 * refuses anything else (400), bodies over the size limit included.
 */
export function uploadMedia(
  file: File,
  categoryId: number,
  onProgress?: (percent: number) => void,
): Promise<MediaData> {
  const body = new FormData();
  body.append("file", file);
  // What files it in the library rather than merely storing it — see
  // KBRD-API's own `upload_media`, which answers with the whole record
  // when it's given one.
  body.append("category_id", String(categoryId));
  return sendFile<MediaData>("POST", MEDIA_URL, body, onProgress);
}

/**
 * Puts a new file behind an existing library entry — what a media dropped
 * onto another's square does. The entry keeps its id and its category and
 * comes back as it now stands; the file it held is dropped unless a
 * plugin config still draws with it. KBRD-API refuses (400) anything it
 * would refuse an upload, and anything that isn't the same kind as what
 * it would be replacing.
 */
export function replaceMedia(
  filename: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MediaData> {
  const body = new FormData();
  body.append("file", file);
  return sendFile<MediaData>(
    "PUT",
    `${MEDIA_URL}/${filename}`,
    body,
    onProgress,
  );
}

/** Drops a library entry, and its file with it unless a plugin config
 * still draws with that file. */
export const deleteMedia = (filename: string) =>
  api<{ ok: boolean }>(`${MEDIA_URL}/${filename}`, { method: "DELETE" });

/** Where `uploadMedia`'s own filename is served back from. */
export const mediaUrl = (filename: string) => `${MEDIA_URL}/${filename}`;
