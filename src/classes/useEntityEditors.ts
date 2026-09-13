import { useRef, useState } from "react";

import type { LayerMenuHandle } from "../components/menu/Layer";
import { deleteLayout, replaceLayout } from "../api/layouts";
import { deleteLayer, replaceLayer } from "../api/layers";
import type { LayerData } from "../types/layer";
import type { LayoutData } from "../types/layout";

/**
 * Add/Edit/Delete/Duplicate/Replace for the current Layout and Layer —
 * the modal-opening and confirmation plumbing behind `<Display>`'s own
 * display Actions menu (see `App`'s context menu). Both entities share the
 * same shape of interaction (an editor modal, a shared delete/replace
 * confirmation dialog keyed by `kind`), so this owns both rather than
 * duplicating the pattern in two separate hooks.
 */
export function useEntityEditors(params: {
  layout: LayoutData | null;
  layer: LayerData | null;
  // Every Layout/Layer that exists right now — read by "Replace with
  // current", to offer every *other* one as a target, and by the pickers
  // themselves (see `useLayouts` and `menu/Layer`'s own `onItemsChange`).
  layoutItems: LayoutData[];
  layerItems: LayerData[];
  // Re-reads the layout list and re-selects afterwards — `useLayouts`'
  // own, the counterpart of the handle `<Layer>` still exposes for its
  // own list.
  refreshLayouts: (preferredId?: number) => Promise<void>;
}) {
  const { layout, layer, layoutItems, layerItems, refreshLayouts } = params;

  const layerMenuRef = useRef<LayerMenuHandle>(null);
  const [layoutEditorOpened, setLayoutEditorOpened] = useState(false);
  const [editingLayout, setEditingLayout] = useState<LayoutData | null>(null);
  // Non-null while the Layout editor is open in "Duplicate" mode (see
  // `LayoutEditor`'s own `duplicateFrom`) — mutually exclusive with
  // `editingLayout`.
  const [duplicatingLayout, setDuplicatingLayout] = useState<LayoutData | null>(
    null,
  );
  const [layerEditorOpened, setLayerEditorOpened] = useState(false);
  const [editingLayer, setEditingLayer] = useState<LayerData | null>(null);
  const [duplicatingLayer, setDuplicatingLayer] = useState<LayerData | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: "layout" | "layer";
    id: number;
    name: string;
  } | null>(null);
  // Which kind's "Replace with current" picker (`ReplaceEntity`) is open —
  // choosing a target there arms `pendingReplace` for the actual
  // Confirmation instead of replacing right away.
  const [replacePickerKind, setReplacePickerKind] = useState<
    "layout" | "layer" | null
  >(null);
  const [pendingReplace, setPendingReplace] = useState<{
    kind: "layout" | "layer";
    targetId: number;
    targetName: string;
  } | null>(null);

  function openAddLayout() {
    setEditingLayout(null);
    setDuplicatingLayout(null);
    setLayoutEditorOpened(true);
  }

  function openEditLayout() {
    if (!layout) return;
    setEditingLayout(layout);
    setDuplicatingLayout(null);
    setLayoutEditorOpened(true);
  }

  function openDuplicateLayout() {
    if (!layout) return;
    setEditingLayout(null);
    setDuplicatingLayout(layout);
    setLayoutEditorOpened(true);
  }

  function requestDeleteLayout() {
    if (!layout) return;
    setConfirmDelete({ kind: "layout", id: layout.id, name: layout.name });
  }

  function openAddLayer() {
    if (!layout) return;
    setEditingLayer(null);
    setDuplicatingLayer(null);
    setLayerEditorOpened(true);
  }

  function openEditLayer() {
    if (!layer) return;
    setEditingLayer(layer);
    setDuplicatingLayer(null);
    setLayerEditorOpened(true);
  }

  function openDuplicateLayer() {
    if (!layer) return;
    setEditingLayer(null);
    setDuplicatingLayer(layer);
    setLayerEditorOpened(true);
  }

  function requestDeleteLayer() {
    if (!layer) return;
    setConfirmDelete({ kind: "layer", id: layer.id, name: layer.name });
  }

  async function confirmDeleteNow() {
    if (!confirmDelete) return;
    if (confirmDelete.kind === "layout") {
      await deleteLayout(confirmDelete.id);
      setConfirmDelete(null);
      await refreshLayouts();
    } else {
      await deleteLayer(confirmDelete.id);
      setConfirmDelete(null);
      await layerMenuRef.current?.refresh();
    }
  }

  function openReplaceLayout() {
    if (!layout) return;
    setReplacePickerKind("layout");
  }

  function openReplaceLayer() {
    if (!layer) return;
    setReplacePickerKind("layer");
  }

  function cancelReplacePicker() {
    setReplacePickerKind(null);
  }

  // The picker's own "Next" — narrows down *which* Layout/Layer to
  // replace; the actual overwrite still needs its own Confirmation (see
  // `App`'s `pendingReplace`) before `confirmReplaceNow` runs it.
  function pickReplaceTarget(target: { id: number; name: string }) {
    if (!replacePickerKind) return;
    setPendingReplace({
      kind: replacePickerKind,
      targetId: target.id,
      targetName: target.name,
    });
    setReplacePickerKind(null);
  }

  function cancelReplace() {
    setPendingReplace(null);
  }

  async function confirmReplaceNow() {
    if (!pendingReplace) return;
    const { kind, targetId } = pendingReplace;
    if (kind === "layout") {
      if (!layout) return;
      await replaceLayout(targetId, layout.id);
      setPendingReplace(null);
      await refreshLayouts(targetId);
    } else {
      if (!layer) return;
      await replaceLayer(targetId, layer.id);
      setPendingReplace(null);
      await layerMenuRef.current?.refresh(targetId);
    }
  }

  return {
    layerMenuRef,
    layoutEditorOpened,
    setLayoutEditorOpened,
    editingLayout,
    duplicatingLayout,
    layerEditorOpened,
    setLayerEditorOpened,
    editingLayer,
    duplicatingLayer,
    confirmDelete,
    setConfirmDelete,
    openAddLayout,
    openEditLayout,
    openDuplicateLayout,
    requestDeleteLayout,
    openAddLayer,
    openEditLayer,
    openDuplicateLayer,
    requestDeleteLayer,
    confirmDeleteNow,
    layoutItems,
    layerItems,
    replacePickerKind,
    openReplaceLayout,
    openReplaceLayer,
    cancelReplacePicker,
    pickReplaceTarget,
    pendingReplace,
    cancelReplace,
    confirmReplaceNow,
  };
}

export type EntityEditorsApi = ReturnType<typeof useEntityEditors>;
