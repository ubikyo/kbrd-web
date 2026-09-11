/** The two kinds of media the panel holds, and the two tabs it shows them
 * under (see `Media`). A media's kind is fixed at import: a file is one or
 * the other, never both. */
export type MediaKind = "photo" | "video";

/** What a dropped file has to be for KBRD-API to take it, mirroring its
 * own `upload_media` check (see `ALLOWED_IMAGE_EXTENSIONS` /
 * `ALLOWED_VIDEO_EXTENSIONS` in `api/layer.py`, which is also where the
 * list comes from: what the device's own Kivy renderers can draw). Stated
 * here as well so a file it would refuse can be turned away before it's
 * sent; the two have to stay in step. */
export const ACCEPTED_MEDIA: Record<MediaKind, string[]> = {
  photo: [".jpeg", ".jpg", ".png"],
  video: [".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm"],
};

/** The declared types a video is allowed to arrive with besides
 * `video/…`, matching KBRD-API's own `AMBIGUOUS_VIDEO_MIMETYPES`:
 * whether a browser can name `.mkv` or `.avi` at all depends on the
 * machine it runs on, and one that can't sends nothing. */
const AMBIGUOUS_VIDEO_MIMETYPES = ["", "application/octet-stream"];

/** The largest file the device will take, in bytes — 200 MiB, matching
 * both `client_max_body_size` in the device's own nginx config and
 * KBRD-API's `MAX_CONTENT_LENGTH`. Checked here first because nginx is
 * the one that answers when a body is too big, and it answers with a bare
 * 413 that says nothing about which file or what the limit is. */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

/** Which kind KBRD-API would file a given file under, or `null` if it
 * would refuse it outright. */
export function mediaKindOf(file: File): MediaKind | null {
  const name = file.name.toLowerCase();
  const has = (kind: MediaKind) =>
    ACCEPTED_MEDIA[kind].some((extension) => name.endsWith(extension));

  if (has("photo") && file.type.startsWith("image/")) return "photo";
  if (
    has("video") &&
    (file.type.startsWith("video/") ||
      AMBIGUOUS_VIDEO_MIMETYPES.includes(file.type))
  ) {
    return "video";
  }
  return null;
}

/** One category — a free label an imported media is filed under, stored
 * by KBRD-API (`/api/media-category`) so it outlives whatever is filed
 * under it. Named uniquely: the Media panel picks one by name. */
export type MediaCategoryData = {
  id: number;
  name: string;
  created_at: string;
};

/**
 * One imported media — an image or a video the tool can then use (a key's
 * own artwork, a layer background…), filed under one of the categories
 * above. Stored by KBRD-API (`GET /api/media`), which creates the row as
 * part of the upload itself.
 */
export type MediaData = {
  id: number;
  kind: MediaKind;
  category_id: number;
  // The generated name the file is stored under — what
  // `GET /api/media/<filename>` serves it back from, and what a plugin
  // config refers to.
  filename: string;
  // The name it was dropped under.
  name: string;
  created_at: string;
};
