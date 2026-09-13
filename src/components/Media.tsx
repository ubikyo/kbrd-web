import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ActionIcon,
  Box,
  EmptyState,
  Group,
  Progress,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  MdAdd,
  MdDelete,
  MdImage,
  MdPermMedia,
  MdVideocam,
} from "react-icons/md";
// The column switch alone comes from Tabler: its `columns-1`/`columns-2`
// draw the layout they stand for — one pane, then two — where Material
// has no matching pair (see `ColumnPicker`).
import { TbColumns1, TbColumns2 } from "react-icons/tb";

import {
  createMediaCategory,
  deleteMedia,
  deleteMediaCategory,
  listMediaCategories,
  listMedias,
  mediaUrl,
  replaceMedia,
  updateMediaCategory,
  uploadMedia,
} from "../api/media";
import {
  ACCEPTED_MEDIA,
  MAX_MEDIA_BYTES,
  mediaKindOf,
  type MediaCategoryData,
  type MediaData,
  type MediaKind,
} from "../types/media";
import { randomId } from "../utils/id";
import type { MediaColumns } from "../utils/mediaPanel";
import Category from "./menu/Category";
import CategoryEditor from "./modals/CategoryEditor";
import Confirmation from "./modals/Confirmation";

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

/** What makes a drop target of whatever wears it — the panel's empty
 * state, the square that adds medias, and each media's own square, which
 * takes a dropped file as a replacement for what it holds. */
type DropHandlers = {
  "data-dragging": true | undefined;
  onDragEnter: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
};

/**
 * One drop target's own handlers, and the frame it wears while a file is
 * over it.
 *
 * `dragenter`/`dragleave` fire again for every child the pointer crosses
 * inside the target, so the two are counted against each other rather
 * than read one at a time — otherwise the frame flickers off the moment
 * the pointer reaches an icon or a label inside it. A drop stops where it
 * lands: a square inside the panel takes it, rather than it also reaching
 * whatever it sits in.
 */
function useDropTarget(onFiles: (files: File[]) => void): DropHandlers {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  return {
    "data-dragging": dragging || undefined,
    onDragEnter: (event) => {
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (event) => event.preventDefault(),
    onDragLeave: (event) => {
      event.preventDefault();
      depth.current -= 1;
      if (depth.current <= 0) setDragging(false);
    },
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      depth.current = 0;
      setDragging(false);
      onFiles(Array.from(event.dataTransfer.files));
    },
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
 * which would fade in on nothing). Which file was decoded is what's held
 * rather than merely that one was, so a replacement fades in the same way
 * instead of inheriting the last one's. The image keeps its own ratio
 * inside the square's 5px of padding, never filling more of either axis
 * than it has.
 *
 * The square is also what a media is changed from: a file dropped on it
 * replaces what it holds, and the button in its lower right — in view
 * while the pointer is on the square, the same one a plugin row carries —
 * deletes it. Neither is offered while the square is still uploading, its
 * media not being there to replace or delete yet.
 */
function MediaTile({
  media,
  onReplace,
  onDelete,
}: {
  media: LibraryMedia;
  onReplace: (file: File) => void;
  onDelete: () => void;
}) {
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const uploading = media.filename === null;
  const dropTarget = useDropTarget(([file]) => {
    if (file) onReplace(file);
  });

  return (
    <Box className="media-tile" {...dropTarget}>
      {media.filename && (
        <img
          className="media-tile-image"
          src={mediaUrl(media.filename)}
          alt={media.name}
          data-loaded={loadedName === media.filename || undefined}
          onLoad={() => setLoadedName(media.filename)}
        />
      )}
      {uploading ? (
        <Stack className="media-tile-progress" gap={4}>
          <Text size="xs" ta="center">
            {media.progress}%
          </Text>
          <Progress value={media.progress} size="xs" />
        </Stack>
      ) : (
        <ActionIcon
          className="media-tile-delete"
          color="red"
          variant="filled"
          size="sm"
          aria-label={`Delete ${media.name}`}
          onClick={onDelete}
        >
          <MdDelete size={14} />
        </ActionIcon>
      )}
    </Box>
  );
}

/** What the panel says of a file it can't take, wherever it was dropped. */
const WRONG_KIND =
  "Images must be PNG or JPEG; videos MP4, M4V, MOV, MKV, WEBM or AVI.";

/** How the size limit reads with the offending file's name in front. */
const overLimit = (name: string) =>
  `${name}: over the ${Math.round(MAX_MEDIA_BYTES / (1024 * 1024))} MB limit.`;

/**
 * Why a file dropped on `media`'s square can't replace what it holds, or
 * `null` if it can — the same three things the device would turn it away
 * for, checked here so a file that has no business replacing this media
 * is refused outright rather than through a confirmation asking whether
 * to go ahead with it.
 */
function replaceRefusal(media: LibraryMedia, file: File): string | null {
  if (file.size > MAX_MEDIA_BYTES) return overLimit(file.name);
  const kind = mediaKindOf(file);
  if (kind === null) return WRONG_KIND;
  // A square stays in the tab it is being shown under, which is also what
  // KBRD-API holds a replacement to.
  if (kind !== media.kind) {
    return media.kind === "photo"
      ? "A photo can only be replaced by another photo."
      : "A video can only be replaced by another video.";
  }
  return null;
}

/** What a file has to be to be worth opening the picker on — the same
 * extensions `mediaKindOf` checks a dropped file against, so both ways
 * into the library offer the same files. */
const ACCEPT_ATTRIBUTE = [...ACCEPTED_MEDIA.photo, ...ACCEPTED_MEDIA.video].join(
  ",",
);

/**
 * The band that adds medias, along the foot of the panel under whatever
 * either tab is showing — a `+` and the drop message, held there while
 * the library above it scrolls (see `.media-add`).
 *
 * Both ways in, in one place: a file can be dropped on it (it carries the
 * panel's own drop handlers), or it can be clicked to pick files — the
 * `input` behind it takes several at once, which is why the message says
 * so. The input is cleared on the way out so picking the very same file
 * again still fires `change`.
 */
function MediaAddTile({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const dropTarget = useDropTarget(onFiles);

  return (
    <UnstyledButton
      className="media-add"
      onClick={() => input.current?.click()}
      {...dropTarget}
    >
      <MdAdd size={28} />
      <Text size="xs" c="dimmed" ta="center">
        Drop images or videos here, or click to pick them
      </Text>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        hidden
        // The input is inside the button it's opened from, so the click
        // opening it would bubble straight back into that handler and
        // open it again — it stops here instead.
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </UnstyledButton>
  );
}

/**
 * One tab's own medias, under the category currently picked. They run
 * across as many columns as the panel is showing (see `.media-list`,
 * which is what a second column turns into a grid), flush against each
 * other and against the panel's edges, ruled rather than spaced — every
 * line of the grid except the one above its first row and its own two
 * sides. What adds more is the band at the foot of the panel, outside
 * this.
 *
 * With nothing to list — the library has medias, but none of this kind
 * under the category on show — the tab says so and takes the drop itself,
 * the add band being held back for a tab that has something in it.
 *
 * Whatever the last attempt to add, replace or delete one had to say goes
 * above the list rather than under it — a library of any size scrolls,
 * and a message below it would be off-screen exactly when it matters —
 * and outside it rather than in it: the list's children are its squares
 * and nothing else, which is what lets the rule between two columns be
 * drawn off each square's own position in it.
 */
function MediaList({
  medias,
  kind,
  columns,
  onAdd,
  onReplace,
  onDelete,
  error,
}: {
  medias: LibraryMedia[];
  kind: MediaKind;
  columns: MediaColumns;
  onAdd: (files: File[]) => void;
  onReplace: (media: LibraryMedia, file: File) => void;
  onDelete: (media: LibraryMedia) => void;
  error: string | null;
}) {
  const photo = kind === "photo";
  // Only ever the empty state's, below: a list that has squares in it has
  // the add band under it, and each square is its own target.
  const dropTarget = useDropTarget(onAdd);

  return (
    <>
      {error && (
        <Text className="media-error" size="xs" c="red">
          {error}
        </Text>
      )}
      {medias.length === 0 ? (
        // The library has something in it, just nothing of this kind under
        // this category — so the whole panel's drop zone isn't showing and
        // this tab has to be one itself. The band that adds medias isn't
        // there either (it only ever stands under a list there is
        // something in), which leaves this the way to add the first one.
        <Box className="media-dropzone" {...dropTarget}>
          <EmptyState
            className="media-empty"
            icon={photo ? <MdImage size={28} /> : <MdVideocam size={28} />}
            title={photo ? "No image here" : "No video here"}
            description={
              photo
                ? "Drop an image here to add it to this category"
                : "Drop a video here to add it to this category"
            }
          />
        </Box>
      ) : (
        <Stack className="media-list" data-columns={columns} gap={0}>
          {medias.map((media) => (
            <MediaTile
              key={media.key}
              media={media}
              onReplace={(file) => onReplace(media, file)}
              onDelete={() => onDelete(media)}
            />
          ))}
          {/* A row the medias leave half empty still belongs to the grid:
              the cell is drawn even though nothing is in it, so the rules
              around it — the one above the row, the one down the middle —
              run the width of the list like every other. */}
          {columns === 2 && medias.length % 2 === 1 && (
            <Box className="media-tile" aria-hidden />
          )}
        </Stack>
      )}
    </>
  );
}

/**
 * The pair facing the category picker across the top row: one square per
 * row, or two. They read as one control — whichever is in force is lit,
 * the other is dimmed — and wear the same hover as the Properties tab's
 * own expand toggle, an icon-only control of exactly the same kind (see
 * `.inspector-expand-toggle`).
 */
function ColumnPicker({
  columns,
  onChange,
}: {
  columns: MediaColumns;
  onChange: (columns: MediaColumns) => void;
}) {
  const choices = [
    { value: 1, label: "One column", icon: <TbColumns1 size={18} /> },
    { value: 2, label: "Two columns", icon: <TbColumns2 size={18} /> },
  ] as const;

  return (
    // The group's own 3px is given back so the first icon still starts on
    // the 15px gutter the row is padded to, its button's padding being
    // what it hovers with.
    <Group gap={2} ml={-3}>
      {choices.map((choice) => (
        <UnstyledButton
          key={choice.value}
          className="media-columns-toggle"
          data-active={columns === choice.value || undefined}
          aria-label={choice.label}
          aria-pressed={columns === choice.value}
          onClick={() => onChange(choice.value)}
          style={{ display: "flex", alignItems: "center" }}
        >
          {choice.icon}
        </UnstyledButton>
      ))}
    </Group>
  );
}

type Props = {
  opened: boolean;
  onToggle: () => void;
  columns: MediaColumns;
  onColumnsChange: (columns: MediaColumns) => void;
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
export default function Media({
  opened,
  onToggle,
  columns,
  onColumnsChange,
}: Props) {
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
  const [dropError, setDropError] = useState<string | null>(null);
  // Which media the delete button was pressed on, and so what the
  // confirmation below is asking about.
  const [deletingMedia, setDeletingMedia] = useState<LibraryMedia | null>(null);
  // The media a file was dropped on and the file itself, held while the
  // confirmation asks whether to overwrite the one with the other.
  const [replacing, setReplacing] = useState<{
    media: LibraryMedia;
    file: File;
  } | null>(null);

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

  /** Changes one media in place, wherever it has got to in the list. */
  const patchMedia = (key: string, fields: Partial<LibraryMedia>) =>
    setMedias((current) =>
      current.map((media) =>
        media.key === key ? { ...media, ...fields } : media,
      ),
    );

  async function addFiles(files: File[]) {
    // Whatever the device would turn away is turned away here first, so a
    // stray file says why instead of coming back as a bare 400 from
    // KBRD-API — or, past the size limit, a bare 413 from the nginx in
    // front of it, which never even reaches KBRD-API.
    const tooBig = files.filter((file) => file.size > MAX_MEDIA_BYTES);
    if (tooBig.length > 0) {
      setDropError(overLimit(tooBig.map((file) => file.name).join(", ")));
      return;
    }
    const accepted = files.flatMap((file) => {
      const kind = mediaKindOf(file);
      return kind ? [{ file, kind }] : [];
    });
    if (accepted.length === 0) {
      setDropError(WRONG_KIND);
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
    // All of them at once rather than one after another: several files
    // added together go out side by side, each square showing its own
    // file's progress, instead of queueing behind the first.
    await Promise.all(
      accepted.map(async ({ file, kind }) => {
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
        try {
          const stored = await uploadMedia(file, categoryId, (progress) =>
            patchMedia(key, { progress }),
          );
          patchMedia(key, { progress: 100, filename: stored.filename });
        } catch (error) {
          // The square goes with it: there is no media to show, and the
          // message below says why.
          setMedias((current) => current.filter((media) => media.key !== key));
          setDropError(
            error instanceof Error ? error.message : "Could not add the file",
          );
        }
      }),
    );
  }

  /**
   * Puts a new file behind a media that is already there — what dropping
   * one onto another's square does, once `askReplace` below has had that
   * confirmed. The square shows the new file going out exactly as a fresh
   * one does, and is back to the media it was showing if it doesn't make
   * it.
   */
  /**
   * Asks before replacing: a file dropped on a square is only taken once
   * the dialog below has been said yes to, the square's own media being
   * overwritten on the device rather than merely added to. A file that
   * couldn't replace this media anyway never gets that far — it's refused
   * here, with the reason above the list.
   */
  function askReplace(media: LibraryMedia, file: File) {
    // Nothing to replace until the media it holds is actually there.
    if (media.filename === null) return;
    const refusal = replaceRefusal(media, file);
    if (refusal !== null) {
      setDropError(refusal);
      return;
    }
    setDropError(null);
    setReplacing({ media, file });
  }

  /** Confirmed from the dialog below, never straight off the drop. */
  async function replaceFile(media: LibraryMedia, file: File) {
    setReplacing(null);
    const previous = media.filename;
    if (previous === null) return;
    setDropError(null);
    patchMedia(media.key, { progress: 0, filename: null });
    try {
      const stored = await replaceMedia(previous, file, (progress) =>
        patchMedia(media.key, { progress }),
      );
      patchMedia(media.key, {
        progress: 100,
        filename: stored.filename,
        name: stored.name,
      });
    } catch (error) {
      patchMedia(media.key, { progress: 100, filename: previous });
      setDropError(
        error instanceof Error ? error.message : "Could not replace the media",
      );
    }
  }

  /** Confirmed from the dialog below, never straight off the button. */
  async function removeMedia(media: LibraryMedia) {
    setDeletingMedia(null);
    if (media.filename === null) return;
    try {
      await deleteMedia(media.filename);
      setMedias((current) =>
        current.filter((item) => item.key !== media.key),
      );
      setDropError(null);
    } catch (error) {
      setDropError(
        error instanceof Error ? error.message : "Could not delete the media",
      );
    }
  }

  // The empty state's own drop target. Every other one belongs to the
  // square that wears it — the one that adds medias, and each media's own
  // (see `useDropTarget`).
  const dropTarget = useDropTarget((files) => void addFiles(files));

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
            rather than inside either panel — and goes with them while the
            library is empty: there is nothing to file under a category,
            and nothing to lay out in one column or two, until something
            has been dropped in. */}
        {medias.length > 0 && (
          <Group justify="space-between" px={15} pt={15} pb={15}>
            <ColumnPicker columns={columns} onChange={onColumnsChange} />
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
        )}

        {medias.length === 0 ? (
          // Nothing in the library yet: the tabs would have nothing to
          // show either way, so the drop zone takes the whole panel, top
          // to bottom.
          <Box className="media-dropzone" data-empty {...dropTarget}>
            {/* The frame keeps its own size and place — it's the drop
                target — while the message it holds is placed like every
                other empty state in the app, on the window's own middle
                (see `.media-panel-empty` in App.css). The error a refused
                drop leaves rides along with it, directly under it. */}
            <Stack className="media-panel-empty" align="center" gap={10}>
              <EmptyState
                icon={<MdPermMedia size={28} />}
                title="No medias yet"
                description={
                  <>
                    Drop an image or
                    <br />
                    a video to upload it
                  </>
                }
              />
              {dropError && (
                <Text size="xs" c="red" ta="center">
                  {dropError}
                </Text>
              )}
            </Stack>
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

            {/* The panels themselves aren't drop targets any more — the
                square at the foot of each list is the one, and says so. */}
            <Tabs.Panel value="photo">
              <MediaList
                medias={shown("photo")}
                kind="photo"
                columns={columns}
                onAdd={(files) => void addFiles(files)}
                onReplace={askReplace}
                onDelete={setDeletingMedia}
                error={dropError}
              />
            </Tabs.Panel>

            <Tabs.Panel value="video">
              <MediaList
                medias={shown("video")}
                kind="video"
                columns={columns}
                onAdd={(files) => void addFiles(files)}
                onReplace={askReplace}
                onDelete={setDeletingMedia}
                error={dropError}
              />
            </Tabs.Panel>
          </Tabs>
        )}

        {/* Under the tab on show, and only once that tab has a square of
            its own to stand under: a tab with nothing in it is a drop zone
            already asking for the same thing (see `MediaList`), as is an
            empty library, and a second invitation under either would only
            say it twice. */}
        {shown(tab).length > 0 && (
          <MediaAddTile onFiles={(files) => void addFiles(files)} />
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

        {replacing && (
          <Confirmation
            title="Replace media"
            message={
              <>
                Replace{" "}
                <Text component="span" fw={600}>
                  {replacing.media.name}
                </Text>{" "}
                with{" "}
                <Text component="span" fw={600}>
                  {replacing.file.name}
                </Text>
                ?
              </>
            }
            onConfirm={() => void replaceFile(replacing.media, replacing.file)}
            onCancel={() => setReplacing(null)}
          />
        )}

        {deletingMedia && (
          <Confirmation
            title="Delete media"
            message={
              <>
                Delete{" "}
                <Text component="span" fw={600}>
                  {deletingMedia.name}
                </Text>
                ?
              </>
            }
            onConfirm={() => void removeMedia(deletingMedia)}
            onCancel={() => setDeletingMedia(null)}
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
