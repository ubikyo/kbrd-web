import { Box, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { MdAdd, MdCheck, MdKeyboardArrowDown } from "react-icons/md";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

import {
  activateLayer,
  deactivateLayer,
  listLayers,
} from "../../api/layers";
import type { LayerData } from "../../types/layer";

type Props = {
  layoutId: number;
  onChange: (layer: LayerData | null) => void;
  // Edit/Duplicate/Replace/Delete live in Composer's own display Actions
  // menu (select the physical screen), but Add stays reachable straight
  // from this picker too — the quickest path to a new one.
  onAdd: () => void;
  // The full list, whenever it (re)loads — lets `App` build the "Replace
  // with current" picker (every *other* layer) without this component
  // needing to know anything about that feature itself.
  onItemsChange?: (items: LayerData[]) => void;
  // Layer only matters in Layer mode (Render/Invoke plugins attach to
  // it; Layout plugins attach to the Layout itself) — `Composer` hides
  // this picker in Layout mode by setting this, rather than unmounting
  // the component outright, so switching modes back and forth doesn't
  // re-trigger its own load/(re)activate effect above every time.
  hidden?: boolean;
};

// Add lives here; Edit/Duplicate/Replace/Delete live in Composer's own
// display Actions menu, not here — this dropdown is just the picker.
// `App` drives those through this handle so it can refresh the list and
// re-select afterwards, the same way this component always has.
export type LayerMenuHandle = {
  refresh: (preferredId?: number) => Promise<void>;
};

const Layer = forwardRef<LayerMenuHandle, Props>(function Layer(
  { layoutId, onChange, onAdd, onItemsChange, hidden = false },
  ref,
) {
  const [items, setItems] = useState<LayerData[]>([]);
  const [selected, setSelected] = useState<LayerData | null>(null);
  const [menuOpened, setMenuOpened] = useState(false);

  const select = useCallback(
    async (item: LayerData) => {
      const value = await activateLayer(item.id);
      setSelected(value);
      onChange(value);
      setMenuOpened(false);
    },
    [onChange],
  );

  useEffect(() => {
    let cancelled = false;
    void listLayers(layoutId).then(async (data) => {
      if (cancelled) return;
      setItems(data);
      onItemsChange?.(data);
      const current = data.find((item) => item.active) ?? data[0];
      if (current) await select(current);
      else {
        await deactivateLayer();
        if (cancelled) return;
        setSelected(null);
        onChange(null);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutId, onChange, select]);

  async function refresh(preferredId?: number) {
    const data = await listLayers(layoutId);
    setItems(data);
    onItemsChange?.(data);
    const current = data.find((item) => item.id === preferredId) ?? data[0];
    if (current) await select(current);
    else {
      await deactivateLayer();
      setSelected(null);
      onChange(null);
    }
  }

  useImperativeHandle(ref, () => ({ refresh }));

  if (hidden) return null;

  // Same interaction pattern as the Properties tab's own States menu
  // (see `Inspector`): an unstyled target showing the current selection
  // with a trailing chevron, each option listed with a checkmark when
  // selected, a divider, then the one action this picker keeps (Add).
  return (
    <Menu
      opened={menuOpened}
      onChange={setMenuOpened}
      position="bottom-end"
      width={220}
      shadow="md"
    >
      <Menu.Target>
        <UnstyledButton
          onClick={() => setMenuOpened((value) => !value)}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <Text size="sm" fw={500}>
            {selected?.name ?? "None"}
          </Text>
          <MdKeyboardArrowDown size={16} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {items.map((item) => (
          <Menu.Item
            key={item.id}
            onClick={() => void select(item)}
            leftSection={
              selected?.id === item.id ? (
                <MdCheck size={16} />
              ) : (
                <Box w={16} />
              )
            }
          >
            <Group gap={4} wrap="nowrap">
              <Text size="sm" fw={500}>
                {item.name}
              </Text>
              {item.description && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {item.description}
                </Text>
              )}
            </Group>
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          leftSection={<MdAdd size={16} />}
          onClick={() => {
            setMenuOpened(false);
            onAdd();
          }}
        >
          Add
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
});

export default Layer;
