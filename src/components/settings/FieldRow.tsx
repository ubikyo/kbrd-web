import { Box, Text } from "@mantine/core";

type Props = {
  label: string;
  children: React.ReactNode;
};

/** Same 40/60 label/control split for every field in the Settings modal.
 * Shared rather than local to `Settings` so the tabs that live in files
 * of their own (see `Network`) line up with the ones that don't. */
export default function FieldRow({ label, children }: Props) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 4fr) minmax(0, 6fr)",
        columnGap: "var(--mantine-spacing-md)",
        alignItems: "center",
      }}
    >
      <Text size="sm">{label}</Text>
      {children}
    </Box>
  );
}
