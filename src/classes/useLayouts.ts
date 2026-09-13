import { useCallback, useEffect, useRef, useState } from "react";

import { listLayouts } from "../api/layouts";
import type { LayoutData } from "../types/layout";
import { defaultLayout } from "../utils/layout";

/**
 * Every Layout that exists, and the one reload every mutation of them
 * goes through. This used to belong to the header's own Layout picker
 * (`menu/Layout`, gone now that the picker lives on the display itself —
 * see `menu/LayoutPicker`); the list outlived that component, being read
 * by the picker, by "Replace with current" (`useEntityEditors`) and by
 * `Composer`'s own empty state alike, so it sits here instead, beside the
 * selection `App` already held.
 *
 * `refresh` re-reads the list and picks what to show afterwards: the
 * layout asked for (a freshly created/edited one), else whichever is
 * still loaded, else the default one — or nothing at all, once the last
 * layout has been deleted.
 */
export function useLayouts(params: {
  // The loaded layout's own id, so a plain `refresh()` (after a delete or
  // a replace) can stay on it when it's still there.
  currentId: number | null;
  onSelect: (layout: LayoutData | null) => void;
}) {
  const [items, setItems] = useState<LayoutData[]>([]);
  // Whether the list has come back from the API at all yet — until it
  // has, "no layout" can't be told from "not loaded", and `Composer`'s own
  // empty state would flash over the display on every startup.
  const [loaded, setLoaded] = useState(false);

  // Read by `refresh` at call time rather than closed over, so the one
  // stable function can be handed to `useEntityEditors` (and the editor
  // modals) without ever going stale as the selection changes.
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  });

  const refresh = useCallback(async (preferredId?: number) => {
    const data = await listLayouts();
    const { currentId, onSelect } = latest.current;
    setItems(data);
    setLoaded(true);
    onSelect(
      data.find((item) => item.id === preferredId) ??
        data.find((item) => item.id === currentId) ??
        defaultLayout(data) ??
        null,
    );
  }, []);

  // The first load. Same work `refresh` does, inline rather than through
  // it: the list arriving is what mounts the whole app's content, so this
  // one is the only load that can still be dropped half-way (a remount in
  // development's own StrictMode double-run) without anything to re-select
  // onto afterwards.
  useEffect(() => {
    let cancelled = false;
    void listLayouts().then((data) => {
      if (cancelled) return;
      setItems(data);
      setLoaded(true);
      latest.current.onSelect(defaultLayout(data) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loaded, refresh };
}
