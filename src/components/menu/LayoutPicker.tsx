import { Box, Group, Menu, Text, UnstyledButton } from "@mantine/core";
import {
  MdAdd,
  MdCheck,
  MdDelete,
  MdEdit,
  MdKeyboardArrowDown,
} from "react-icons/md";

import type { LayoutData } from "../../types/layout";

type Props = {
  layouts: LayoutData[];
  activeLayout: LayoutData | null;
  onSelect: (layout: LayoutData) => void;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Layout mode's own layout picker, top-right of the display — the same
 * spot (and the same shape) Layer mode gives the Layer picker
 * (`menu/Layer`): the current selection with a trailing chevron, each
 * option listed with a checkmark when selected, a divider, then
 * Add/Edit/Delete.
 *
 * Unlike `menu/Layer` — and like `menu/State`/`menu/Category` — this owns
 * no data of its own: the list, the selection and every action behind
 * these items already belong to `App` (`useLayouts`, which loads the list
 * and owns the reload behind every mutation, and `useEntityEditors`,
 * which opens each of these actions' own modal).
 */
export default function LayoutPicker({
  layouts,
  activeLayout,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  return (
    <Menu position="bottom-end" width={220} shadow="md">
      <Menu.Target>
        <UnstyledButton
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <Text size="sm" fw={500}>
            {activeLayout?.name ?? "None"}
          </Text>
          <MdKeyboardArrowDown size={16} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {layouts.map((item) => (
          <Menu.Item
            key={item.id}
            onClick={() => onSelect(item)}
            leftSection={
              activeLayout?.id === item.id ? (
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
        <Menu.Item leftSection={<MdAdd size={16} />} onClick={onAdd}>
          Add
        </Menu.Item>
        <Menu.Item
          leftSection={<MdEdit size={16} />}
          disabled={!activeLayout}
          onClick={onEdit}
        >
          Edit
        </Menu.Item>
        <Menu.Item
          color="red"
          leftSection={<MdDelete size={16} />}
          disabled={!activeLayout}
          onClick={onDelete}
        >
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
