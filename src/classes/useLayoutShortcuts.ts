import { useEffect, useRef, useState } from "react";

/**
 * Every global keyboard shortcut the display responds to, independent of
 * whatever's focused: Tab toggles "Resize" (Layout-only — see
 * `resizeEnabled`), Cmd/Ctrl+Z undoes the last edit, Backspace deletes
 * whatever's selected, Cmd/Ctrl+C copies a cell, Cmd/Ctrl+V pastes into
 * empty space, ← / → walk the selection from one cell (or division) to
 * the next. Both effects skip firing while a modal has its own fields
 * to type/tab through, or while the user is typing into a text field
 * somewhere else (a plugin's config, a name field…) rather than working
 * the display.
 *
 * Backspace/Copy/Paste fire in either mode — this hook has no `mode` of
 * its own to gate on. `Composer` (the only caller) passes whichever
 * implementation matches the mode it's currently in: `useDisplayGrid`'s
 * own geometry operations in Layout, its own Layer-content operations
 * (working off `keyRef`/`layer.plugins` instead) in Layer — this hook
 * stays ignorant of which is which.
 *
 * The keydown handler itself is read through a ref (`shortcutsRef`)
 * rather than listed as an effect dependency, so the `window` listener is
 * attached once on mount, not re-subscribed on every render this hook's
 * many inputs change.
 */
export function useLayoutShortcuts(params: {
  // Only gates the Tab/Resize shortcut below — Resize is a Layout-only
  // concept, so Tab does nothing while in Layer mode. Every other
  // shortcut in this hook stays mode-agnostic, per the class doc above.
  mode: "layout" | "layer";
  settingsOpened: boolean;
  layoutEditorOpened: boolean;
  layerEditorOpened: boolean;
  confirmDeleteOpen: boolean;
  divideModalOpened: boolean;
  hasCellSelection: boolean;
  hasDivisionSelection: boolean;
  canCopySelection: boolean;
  emptySelection: { canPaste: boolean } | null;
  // Whether Cmd/Ctrl+V has anywhere to land right now — the selected
  // empty row, or the sole selected cell's own row (see `useDisplayGrid`'s
  // `canPasteAfterSelection`), so Copy then Paste can round-trip onto the
  // same cell's row without re-selecting its trailing space first.
  canPaste: boolean;
  undo: () => void;
  requestDeleteCells: () => void;
  requestDeleteDivisions: () => void;
  copySelectedCell: () => void;
  pasteToEmptyRow: () => void;
  // Moves the selection one cell (or division) left/right — see
  // `useDisplayGrid`'s own `selectAdjacent`, which decides what's
  // actually next over and no-ops on anything but a single selected
  // cell/division.
  selectAdjacent: (direction: -1 | 1) => void;
}) {
  const {
    mode,
    settingsOpened,
    layoutEditorOpened,
    layerEditorOpened,
    confirmDeleteOpen,
    divideModalOpened,
    hasCellSelection,
    hasDivisionSelection,
    canCopySelection,
    emptySelection,
    canPaste,
    undo,
    requestDeleteCells,
    requestDeleteDivisions,
    copySelectedCell,
    pasteToEmptyRow,
    selectAdjacent,
  } = params;

  const [resizeEnabled, setResizeEnabled] = useState(false);

  // Option/Alt+Tab toggles Resize — a global shortcut, independent of
  // mode/selection — except while a modal has its own fields to tab
  // through normally, or while typing in a text field, where Tab must
  // keep doing its normal job. Plain Tab is Composer's own Layout/Layer
  // toggle instead (see there) and must not also flip Resize. Not
  // Cmd/Ctrl+Tab: the OS (macOS's own app switcher, at least) intercepts
  // that before it ever reaches the browser, so the shortcut was
  // effectively dead on the platform it matters most on.
  useEffect(() => {
    if (
      mode !== "layout" ||
      settingsOpened ||
      layoutEditorOpened ||
      layerEditorOpened ||
      confirmDeleteOpen
    ) {
      return;
    }
    function handleTab(event: KeyboardEvent) {
      if (event.key !== "Tab" || !event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setResizeEnabled((current) => !current);
    }
    window.addEventListener("keydown", handleTab);
    return () => window.removeEventListener("keydown", handleTab);
  }, [mode, settingsOpened, layoutEditorOpened, layerEditorOpened, confirmDeleteOpen]);

  const anyModalOpen = Boolean(
    settingsOpened ||
      layoutEditorOpened ||
      layerEditorOpened ||
      confirmDeleteOpen ||
      divideModalOpened,
  );
  const shortcutsRef = useRef({
    anyModalOpen,
    hasCellSelection,
    hasDivisionSelection,
    canCopySelection,
    emptySelection,
    canPaste,
    undo,
    requestDeleteCells,
    requestDeleteDivisions,
    copySelectedCell,
    pasteToEmptyRow,
    selectAdjacent,
  });
  useEffect(() => {
    shortcutsRef.current = {
      anyModalOpen,
      hasCellSelection,
      hasDivisionSelection,
      canCopySelection,
      emptySelection,
      canPaste,
      undo,
      requestDeleteCells,
      requestDeleteDivisions,
      copySelectedCell,
      pasteToEmptyRow,
      selectAdjacent,
    };
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const {
        anyModalOpen,
        hasCellSelection,
        hasDivisionSelection,
        canCopySelection,
        emptySelection,
        canPaste,
        undo,
        requestDeleteCells,
        requestDeleteDivisions,
        copySelectedCell,
        pasteToEmptyRow,
        selectAdjacent,
      } = shortcutsRef.current;
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(
        target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable),
      );
      // Cmd/Ctrl+Z — independent of `mode`/selection (unlike every other
      // shortcut below), but still not while a modal has its own fields
      // to undo through normally, or while typing anywhere else.
      if (
        !anyModalOpen &&
        !isTyping &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        undo();
        return;
      }
      if (
        isTyping ||
        (!hasCellSelection && !hasDivisionSelection && !emptySelection)
      ) {
        return;
      }
      const withModifier = event.metaKey || event.ctrlKey;
      // ← / → walk the selection across the display, one cell (or
      // division of a divided one) at a time. Bare arrows only: every
      // modified combination is left to the browser, and so is an arrow
      // pressed with nothing but empty space selected — `selectAdjacent`
      // has no cell to start from then, so there's nothing to swallow the
      // key for.
      if (
        (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
        (hasCellSelection || hasDivisionSelection) &&
        !withModifier &&
        !event.altKey &&
        !event.shiftKey
      ) {
        event.preventDefault();
        selectAdjacent(event.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      // A division being the real focus must win here — otherwise
      // Backspace would fall through to `requestDeleteCells` and delete
      // the whole divided cell, every other division along with it,
      // rather than just clearing the selected one(s)' own plugin (a
      // division can never be removed on its own, only cleared).
      if (event.key === "Backspace" && hasDivisionSelection) {
        event.preventDefault();
        requestDeleteDivisions();
      } else if (event.key === "Backspace" && hasCellSelection) {
        event.preventDefault();
        requestDeleteCells();
      } else if (
        canCopySelection &&
        withModifier &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        copySelectedCell();
      } else if (withModifier && event.key.toLowerCase() === "v") {
        if (canPaste) {
          event.preventDefault();
          pasteToEmptyRow();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { resizeEnabled, setResizeEnabled };
}
