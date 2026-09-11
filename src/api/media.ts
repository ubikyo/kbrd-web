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
 * Stores one image or video under `categoryId` and hands back the library
 * record that was created — see KBRD-API's own `upload_media`, which
 * checks the extension and the declared type against `ACCEPTED_MEDIA` and
 * refuses anything else (400), bodies over the size limit included.
 *
 * On `XMLHttpRequest` rather than `fetch`, the one thing this file does
 * differently: only XHR reports how much of a *request body* has gone out
 * (`upload.progress`), which is what the Media panel's own tiles show
 * while a file is being sent. `fetch` has no equivalent.
 */
export function uploadMedia(
  file: File,
  categoryId: number,
  onProgress?: (percent: number) => void,
): Promise<MediaData> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const body = new FormData();
    body.append("file", file);
    // What files it in the library rather than merely storing it — see
    // KBRD-API's own `upload_media`, which answers with the whole record
    // when it's given one.
    body.append("category_id", String(categoryId));

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
        resolve(data as MediaData);
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

    request.open("POST", MEDIA_URL);
    request.send(body);
  });
}

/** Where `uploadMedia`'s own filename is served back from. */
export const mediaUrl = (filename: string) => `${MEDIA_URL}/${filename}`;
