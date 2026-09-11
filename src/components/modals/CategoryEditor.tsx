import { useState } from "react";
import { Box, Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";

type Props = {
  mode: "add" | "edit";
  editingName?: string;
  // Whatever KBRD-API refused this name for, most often another category
  // already going by it (409) — shown on the field rather than closing
  // the modal, so the name can be fixed where it was typed. Cleared by
  // `Media` on the next keystroke.
  error?: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
  onNameChange?: () => void;
};

/** Add/Edit a media category — shared by both actions on the Media
 * panel's own category menu (see `Category`). A name is all a category
 * is; uniqueness is KBRD-API's call, not this form's. */
export default function CategoryEditor({
  mode,
  editingName,
  error,
  onClose,
  onSubmit,
  onNameChange,
}: Props) {
  const [name, setName] = useState(editingName ?? "");
  const trimmed = name.trim();

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        <Text fw={700}>{mode === "add" ? "Add category" : "Edit category"}</Text>
      }
      centered
      size="sm"
      overlayProps={{ backgroundOpacity: 0.65, blur: 2 }}
      styles={{ body: { padding: 0 } }}
    >
      <Box style={{ padding: "24px 40px 40px" }}>
        <Stack>
          <TextInput
            variant="filled"
            label="Name"
            value={name}
            data-autofocus
            error={error ?? undefined}
            onChange={(event) => {
              setName(event.currentTarget.value);
              onNameChange?.();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmed.length > 0) {
                onSubmit(trimmed);
              }
            }}
          />
        </Stack>
      </Box>

      <Group
        justify="flex-end"
        p="md"
        style={{ borderTop: "1px solid var(--kbrd-border-color)" }}
      >
        <Button color="gray" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={trimmed.length === 0} onClick={() => onSubmit(trimmed)}>
          {mode === "add" ? "Add" : "Save"}
        </Button>
      </Group>
    </Modal>
  );
}
