import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  Box,
  Group,
  Progress,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { MdFileUpload } from "react-icons/md";

import {
  createMediaCategory,
  deleteMediaCategory,
  listMediaCategories,
  listMedias,
  mediaUrl,
  updateMediaCategory,
  uploadMedia,
} from "../api/media";
import {
  MAX_MEDIA_BYTES,
  mediaKindOf,
  type MediaCategoryData,
  type MediaData,
  type MediaKind,
} from "../types/media";
import { randomId } from "../utils/id";
import Category from "./menu/Category";
import CategoryEditor from "./modals/CategoryEditor";
import Confirmation from "./modals/Confirmation";

/** The panel's own fixed width — stated here and read by `App`, which
 * opens its track to exactly that much and keeps the panel itself that
 * wide throughout, so it slides instead of stretching. */
export const MEDIA_PANEL_WIDTH = 200;

/**
 * One media the panel shows, from the moment it's dropped: `filename` is
 * the generated name KBRD-API stores it under and is only set once the
 * upload has finished, `progress` how much of it has gone out until then.
 *
 * Keyed locally because a dropped file has no row id until its upload
 * returns — an entry keeps the same key across that, so its square doesn't
 * remount and restart its fade.
 */
type LibraryMedia = {
  key: string;
  kind: MediaKind;
  name: string;
  categoryId: number;
  progress: number;
  filename: string | null;
};

/** A stored row as the panel holds it. */
function fromRecord(media: MediaData): LibraryMedia {
  return {
    key: `media-${media.id}`,
    kind: media.kind,
    name: media.name,
    categoryId: media.category_id,
    progress: 100,
    filename: media.filename,
  };
}

/**
 * One media's own square in the panel: black, ruled, and as wide as the
 * panel leaves it — its list sets the 15px gutter either side, and the
 * square takes its height from that width.
 *
 * It shows its upload before it shows its media: the bar and its
 * percentage sit along the bottom while the file is going out, and the
 * image fades in over them once it's there (`data-loaded`, set when the
 * browser has actually decoded it — not merely when the upload returned,
 * which would fade in on nothing). The image keeps its own ratio inside
 * the square's 5px of padding, never filling more of either axis than it
 * has.
 */
function MediaTile({ media }: { media: LibraryMedia }) {
  const [loaded, setLoaded] = useState(false);
  const uploading = media.filename === null;

  return (
    <Box className="media-tile">
      {media.filename && (
        <img
          className="media-tile-image"
          src={mediaUrl(media.filename)}
          alt={media.name}
          data-loaded={loaded || undefined}
          onLoad={() => setLoaded(true)}
        />
      )}
      {uploading && (
        <Stack className="media-tile-progress" gap={4}>
          <Text size="xs" ta="center">
            {media.progress}%
          </Text>
          <Progress value={media.progress} size="xs" />
        </Stack>
      )}
    </Box>
  );
}

/** One tab's own medias, under the category currently picked. The gutter
 * around it — and so each square's width — comes from the drop frame this
 * sits inside (see `.media-dropzone`). */
function MediaList({
  kind,
  medias,
}: {
  kind: MediaKind;
  medias: LibraryMedia[];
}) {
  if (medias.length === 0) {
    return (
      <Text size="sm" c="dimmed" pt={10}>
        {kind === "photo" ? "No photo yet." : "No video yet."}
      </Text>
    );
  }
  return (
    <Stack gap="xs" pt={10}>
      {medias.map((media) => (
        <MediaTile key={media.key} media={media} />
      ))}
    </Stack>
  );
}

type Props = {
  opened: boolean;
  onToggle: () => void;
};

/**
 * The Media panel, on the far left ahead of the Composer — the tool's own
 * library of images and videos, one tab each, under whichever category
 * the picker above them has selected.
 *
 * It renders its own "Medias" tab as well as the panel: the tab hangs off
 * the panel's right edge (see `.media-tab` in App.css), so while the panel
 * is pushed off-screen the tab is all that shows, sitting on the window's
 * left edge — that's what opens it. The panel itself stays mounted either
 * way, `App`'s own track being what slides it in and out.
 *
 * Categories are the one part of this that's stored: `api/media`'s own
 * category calls go through KBRD-API, and this owns the list behind the
 * picker's Add/Edit/Delete the same way `Inspector` owns the state
 * picker's. A dropped file is stored too — but only as a file. KBRD-API
 * has no media *record* (kind/category/file — see `MediaData`), so what's
 * been added is held here for the session and the panel is back to its
 * drop zone on the next reload.
 */
export default function Media({ opened, onToggle }: Props) {
  const [tab, setTab] = useState<MediaKind>("photo");
  const [categories, setCategories] = useState<MediaCategoryData[]>([]);
  // Held by id rather than by object so a rename (which replaces the row)
  // doesn't lose the selection — the row itself is looked up below.
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [editorMode, setEditorMode] = useState<"add" | "edit" | null>(null);
  // Whatever KBRD-API refused the submitted name for — a name another
  // category already has, most of the time. Shown on the editor's own
  // field, which stays open so it can be fixed there.
  const [editorError, setEditorError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [medias, setMedias] = useState<LibraryMedia[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  // `dragenter`/`dragleave` fire again for every child the pointer crosses
  // inside the zone, so the two are counted against each other rather than
  // read one at a time — otherwise the frame flickers off the moment the
  // pointer reaches the icon or the label.
  const dragDepth = useRef(0);

  const activeCategory =
    categories.find((item) => item.id === activeCategoryId) ?? null;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listMediaCategories(), listMedias()]).then(
      ([categoryData, mediaData]) => {
        if (cancelled) return;
        setCategories(categoryData);
        // KBRD-API keeps at least one category ("Default" on a fresh
        // device), so this only ever falls through to `null` if the list
        // itself failed to load.
        setActiveCategoryId(categoryData[0]?.id ?? null);
        setMedias(mediaData.map(fromRecord));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitCategory(name: string) {
    try {
      const saved =
        editorMode === "edit" && activeCategory
          ? await updateMediaCategory(activeCategory.id, name)
          : await createMediaCategory(name);
      // Re-listed rather than patched in place: KBRD-API orders these by
      // name, so a new or renamed category lands wherever that puts it.
      setCategories(await listMediaCategories());
      setActiveCategoryId(saved.id);
      setEditorMode(null);
      setEditorError(null);
    } catch (error) {
      setEditorError(
        error instanceof Error ? error.message : "Could not save the category",
      );
    }
  }

  async function deleteActiveCategory() {
    if (!activeCategory) return;
    try {
      await deleteMediaCategory(activeCategory.id);
    } catch {
      // The menu doesn't offer to delete the last category, so the only
      // way here is a list that's gone stale (another tab deleted the
      // others). Re-listing below puts that right either way.
    }
    const remaining = await listMediaCategories();
    setCategories(remaining);
    setActiveCategoryId(
      remaining.find((item) => item.id === activeCategoryId)?.id ??
        remaining[0]?.id ??
        null,
    );
    setConfirmDelete(false);
  }

  async function addFiles(files: File[]) {
    // Whatever the device would turn away is turned away here first, so a
    // stray file says why instead of coming back as a bare 400 from
    // KBRD-API — or, past the size limit, a bare 413 from the nginx in
    // front of it, which never even reaches KBRD-API.
    const tooBig = files.filter((file) => file.size > MAX_MEDIA_BYTES);
    if (tooBig.length > 0) {
      setDropError(
        `${tooBig.map((file) => file.name).join(", ")}: over the ${Math.round(
          MAX_MEDIA_BYTES / (1024 * 1024),
        )} MB limit.`,
      );
      return;
    }
    const accepted = files.flatMap((file) => {
      const kind = mediaKindOf(file);
      return kind ? [{ file, kind }] : [];
    });
    if (accepted.length === 0) {
      setDropError(
        "Images must be PNG or JPEG; videos MP4, M4V, MOV, MKV, WEBM or AVI.",
      );
      return;
    }
    // A media is filed under a category, so there has to be one. KBRD-API
    // keeps at least one, which only leaves the case where the list never
    // loaded at all.
    const categoryId = activeCategoryId;
    if (categoryId === null) {
      setDropError("No category to file this under.");
      return;
    }
    setDropError(null);
    for (const { file, kind } of accepted) {
      // Its square goes up first, at 0%, and fills in as the file goes
      // out — the panel shows the upload rather than waiting on it.
      const key = randomId();
      setMedias((current) => [
        ...current,
        {
          key,
          kind,
          name: file.name,
          categoryId,
          progress: 0,
          filename: null,
        },
      ]);
      const patch = (fields: Partial<LibraryMedia>) =>
        setMedias((current) =>
          current.map((media) =>
            media.key === key ? { ...media, ...fields } : media,
          ),
        );
      try {
        const stored = await uploadMedia(file, categoryId, (progress) =>
          patch({ progress }),
        );
        patch({ progress: 100, filename: stored.filename });
      } catch (error) {
        // The square goes with it: there is no media to show, and the
        // message below says why.
        setMedias((current) => current.filter((media) => media.key !== key));
        setDropError(
          error instanceof Error ? error.message : "Could not add the file",
        );
      }
    }
  }

  // Both drop targets — the empty state and each tab's own panel — take
  // the same handlers and wear the same frame, so dropping works wherever
  // the library happens to be showing.
  const dropTarget = {
    "data-dragging": dragging || undefined,
    onDragEnter: (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDragLeave: (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current -= 1;
      if (dragDepth.current <= 0) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      void addFiles(Array.from(event.dataTransfer.files));
    },
  };

  const shown = (kind: MediaKind) =>
    medias.filter(
      (media) => media.kind === kind && media.categoryId === activeCategoryId,
    );

  return (
    <>
      <UnstyledButton
        className="media-tab"
        aria-expanded={opened}
        aria-label={opened ? "Close medias" : "Open medias"}
        onClick={onToggle}
      >
        Medias
      </UnstyledButton>

      {/* Closed, the panel is still mounted (it has to be, to slide) but
          off-screen — `inert` keeps it out of the tab order and off the
          accessibility tree while it is. The tab above isn't inside it,
          so it stays reachable. */}
      <ScrollArea
        className="media-scroll"
        inert={!opened}
        h="100%"
        bg="var(--kbrd-color-body)"
        p={0}
        type="scroll"
        scrollbarSize={1}
        // Mantine's own right-hand default, left as is: the scrollbar rides
        // the panel's right edge, over the rule `.media-scroll` draws there
        // (see App.css) — the same trick as the Inspector's, mirrored, this
        // panel being the one on the left.
        styles={{
          scrollbar: { padding: 0, zIndex: 2 },
          // Mantine lays the content out as a table, which is only as
          // tall as it needs to be; the drop zone below has to reach the
          // bottom of the panel instead. A *minimum* rather than a fixed
          // height, so a full library still grows past it and scrolls.
          content: {
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* The category applies to both tabs, so it sits above the strip
            rather than inside either panel. */}
        <Group justify="flex-end" px={15} pt={15} pb={15}>
          <Category
            categories={categories}
            activeCategory={activeCategory}
            onSelect={(category) => setActiveCategoryId(category.id)}
            onAdd={() => {
              setEditorError(null);
              setEditorMode("add");
            }}
            onEdit={() => {
              setEditorError(null);
              setEditorMode("edit");
            }}
            onDelete={() => setConfirmDelete(true)}
          />
        </Group>

        {medias.length === 0 ? (
          // Nothing in the library yet: the tabs would have nothing to
          // show either way, so the drop zone takes the whole panel from
          // under the category down to the bottom of the window.
          <Box className="media-dropzone" data-empty {...dropTarget}>
            <MdFileUpload size={28} />
            <Text size="sm" c="dimmed" ta="center">
              Drop an image or a video here to add it to the medias
            </Text>
            {dropError && (
              <Text size="xs" c="red" ta="center">
                {dropError}
              </Text>
            )}
          </Box>
        ) : (
          <Tabs
            className="panel-tabs"
            value={tab}
            onChange={(value) => setTab(value === "video" ? "video" : "photo")}
            variant="outline"
          >
            <Tabs.List grow>
              <Tabs.Tab value="photo">Photo</Tabs.Tab>
              <Tabs.Tab value="video">Video</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="photo" pb="lg">
              <Box className="media-dropzone" {...dropTarget}>
                <MediaList kind="photo" medias={shown("photo")} />
              </Box>
            </Tabs.Panel>

            <Tabs.Panel value="video" pb="lg">
              <Box className="media-dropzone" {...dropTarget}>
                <MediaList kind="video" medias={shown("video")} />
              </Box>
            </Tabs.Panel>
          </Tabs>
        )}

        {editorMode && (
          <CategoryEditor
            mode={editorMode}
            editingName={editorMode === "edit" ? activeCategory?.name : undefined}
            error={editorError}
            onClose={() => {
              setEditorMode(null);
              setEditorError(null);
            }}
            onNameChange={() => setEditorError(null)}
            onSubmit={(name) => void submitCategory(name)}
          />
        )}

        {confirmDelete && activeCategory && (
          <Confirmation
            title="Delete category"
            message={
              <>
                Delete category{" "}
                <Text component="span" fw={600}>
                  {activeCategory.name}
                </Text>
                ? This cannot be undone.
              </>
            }
            onConfirm={() => void deleteActiveCategory()}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </ScrollArea>
    </>
  );
}
