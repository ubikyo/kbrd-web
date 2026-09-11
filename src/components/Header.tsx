import type { Ref } from "react";
import { ActionIcon, AppShell, Box, Group } from "@mantine/core";
import { MdSettings } from "react-icons/md";

import kbrdLogo from "../assets/media/KBRD.svg";
import Layout from "./menu/Layout";
import type { LayoutMenuHandle } from "./menu/Layout";
import type { LayoutData } from "../types/layout";

type Props = {
  // The `Layout` picker's own handle/callbacks, passed straight through —
  // the header owns none of that state, it only hosts the menu (see
  // `App`, which still drives it through `useEntityEditors`).
  layoutMenuRef: Ref<LayoutMenuHandle>;
  onLayoutChange: (layout: LayoutData | null) => void;
  onAddLayout: () => void;
  onLayoutItemsChange: (items: LayoutData[]) => void;
  onOpenSettings: () => void;
};

/**
 * The app's own top bar: the KBRD mark, the Layout picker and Settings.
 * Everything it shows is driven from `App` — it holds no state of its own.
 * (The Media panel has no control here: it opens from its own tab on the
 * left edge — see `Media`.)
 */
export default function Header({
  layoutMenuRef,
  onLayoutChange,
  onAddLayout,
  onLayoutItemsChange,
  onOpenSettings,
}: Props) {
  return (
    <AppShell.Header
      bg="var(--kbrd-color-body)"
      style={{
        borderBottom: "1px solid var(--kbrd-border-color)",
      }}
    >
      <Group h="100%" gap={0}>
        <Box
          w={86}
          h="100%"
          px="xs"
          style={{
            display: "flex",
            alignItems: "center",
            boxSizing: "border-box",
          }}
        >
          <img
            src={kbrdLogo}
            alt="KBRD"
            style={{
              width: "100%",
              maxWidth: "100%",
              height: "auto",
              display: "block",
            }}
          />
        </Box>

        <Layout
          ref={layoutMenuRef}
          onChange={onLayoutChange}
          onAdd={onAddLayout}
          onItemsChange={onLayoutItemsChange}
        />

        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          ml="auto"
          mr="md"
          aria-label="Settings"
          onClick={onOpenSettings}
        >
          <MdSettings size={20} />
        </ActionIcon>
      </Group>
    </AppShell.Header>
  );
}
