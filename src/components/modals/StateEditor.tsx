import { useState } from "react";
import { Box, Button, Group, Modal, Select, Stack, Text, TextInput } from "@mantine/core";

type Props = {
  mode: "add" | "edit";
  // Every state this key already has — `editingState` (the one being
  // renamed, in "edit" mode) is excluded from "Copy values from"'s own
  // options, copying a state from itself being pointless.
  states: string[];
  editingState?: string;
  onClose: () => void;
  onSubmit: (name: string, copyFrom: string | null) => void;
};

/** Add/Edit a Layer state — shared by both actions on the States menu
 * (see `Inspector`'s Properties tab): a name, and optionally another
 * state to seed/reset every field's values from. */
export default function StateEditor({
  mode,
  states,
  editingState,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(editingState ?? "");
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const trimmed = name.trim();
  const nameTaken =
    trimmed.length > 0 && trimmed !== editingState && states.includes(trimmed);
  const canSubmit = trimmed.length > 0 && !nameTaken;
  const copySources = states.filter((state) => state !== editingState);

  return (
    <Modal
      opened
      onClose={onClose}
      title={<Text fw={700}>{mode === "add" ? "Add state" : "Edit state"}</Text>}
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
            error={nameTaken ? "A state with this name already exists" : undefined}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Select
            variant="filled"
            label="Copy values from"
            placeholder={
              mode === "add" ? "None — use defaults" : "None — keep current values"
            }
            clearable
            data={copySources}
            value={copyFrom}
            onChange={setCopyFrom}
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
        <Button
          disabled={!canSubmit}
          onClick={() => onSubmit(trimmed, copyFrom)}
        >
          {mode === "add" ? "Add" : "Save"}
        </Button>
      </Group>
    </Modal>
  );
}
