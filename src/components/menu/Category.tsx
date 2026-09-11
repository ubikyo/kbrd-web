import { Box, Menu, Text, UnstyledButton } from "@mantine/core";
import {
  MdAdd,
  MdCheck,
  MdDelete,
  MdEdit,
  MdKeyboardArrowDown,
} from "react-icons/md";

import type { MediaCategoryData } from "../../types/media";

type Props = {
  categories: MediaCategoryData[];
  activeCategory: MediaCategoryData | null;
  onSelect: (category: MediaCategoryData) => void;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * The Media panel's own category picker, above the Photo/Video tabs —
 * same shape as the Properties tab's state picker (`menu/State`): the
 * current selection with a trailing chevron, each option listed with a
 * checkmark when selected, a divider, then Add/Edit/Delete. Edit/Delete
 * need something to act on, so both are disabled while the library has no
 * category at all.
 *
 * Like `menu/State`, this owns no data: `Media` holds the list and every
 * call to `api/media` behind these actions.
 */
export default function Category({
  categories,
  activeCategory,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <UnstyledButton
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <Text size="xs">{activeCategory?.name ?? "No category"}</Text>
          <MdKeyboardArrowDown size={16} />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {categories.map((category) => (
          <Menu.Item
            key={category.id}
            leftSection={
              category.id === activeCategory?.id ? (
                <MdCheck size={16} />
              ) : (
                <Box w={16} />
              )
            }
            onClick={() => onSelect(category)}
          >
            {category.name}
          </Menu.Item>
        ))}
        {categories.length > 0 && <Menu.Divider />}
        <Menu.Item leftSection={<MdAdd size={16} />} onClick={onAdd}>
          Add
        </Menu.Item>
        <Menu.Item
          leftSection={<MdEdit size={16} />}
          disabled={activeCategory === null}
          onClick={onEdit}
        >
          Edit
        </Menu.Item>
        {/* The library always keeps one category — KBRD-API refuses to
            delete the last (400), so it isn't offered either. */}
        <Menu.Item
          leftSection={<MdDelete size={16} />}
          color="red"
          disabled={activeCategory === null || categories.length <= 1}
          onClick={onDelete}
        >
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
