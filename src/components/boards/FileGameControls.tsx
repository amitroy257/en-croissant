import { Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconPlayerTrackNext, IconPlayerTrackPrev } from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { use, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { commands } from "@/bindings";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import ConfirmChangesModal from "@/components/tabs/ConfirmChangesModal";
import { useFileGameNavigation } from "@/hooks/useFileGameNavigation";
import { currentTabAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybinds";
import { formatNumber } from "@/utils/format";
import { getGameName } from "@/utils/treeReducer";

/** Previous / next game buttons for a tab opened from a PGN file with several games. */
function FileGameControls() {
  const { t } = useTranslation();
  const store = use(TreeStateContext)!;
  const headers = useStore(store, (s) => s.headers);
  const setCurrentTab = useSetAtom(currentTabAtom);
  const keyMap = useAtomValue(keyMapAtom);
  const {
    tabFile,
    gameNumber,
    numGames,
    previousGame,
    nextGame,
    hasPrevious,
    hasNext,
    confirmChanges,
    toggleConfirmChanges,
    confirmPendingPage,
  } = useFileGameNavigation();

  // The stored game count can be stale (restored session, file edited elsewhere),
  // so recount whenever a file is shown.
  const filePath = tabFile?.path;
  useEffect(() => {
    if (!filePath) return;
    let cancelled = false;
    commands.countPgnGames(filePath).then((res) => {
      if (cancelled || res.status !== "ok") return;
      setCurrentTab((prev) => {
        if (prev.gameOrigin.kind !== "file" && prev.gameOrigin.kind !== "temp_file") {
          return prev;
        }
        if (prev.gameOrigin.file.path !== filePath) return prev;
        if (prev.gameOrigin.file.numGames === res.data) return prev;
        return {
          ...prev,
          gameOrigin: {
            ...prev.gameOrigin,
            file: { ...prev.gameOrigin.file, numGames: res.data },
          },
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [filePath, setCurrentTab]);

  useHotkeys(keyMap.PREVIOUS_GAME.keys, previousGame, { enabled: !!tabFile });
  useHotkeys(keyMap.NEXT_GAME.keys, nextGame, { enabled: !!tabFile });

  if (!tabFile || numGames <= 1) return null;

  return (
    <>
      <ConfirmChangesModal
        opened={confirmChanges}
        toggle={toggleConfirmChanges}
        closeTab={confirmPendingPage}
      />
      <Group gap="xs" wrap="nowrap">
        <Tooltip label={`${t("Board.Action.PreviousGame")} (${keyMap.PREVIOUS_GAME.keys})`}>
          <Button
            variant="default"
            disabled={!hasPrevious}
            onClick={previousGame}
            leftSection={<IconPlayerTrackPrev size="1rem" />}
          >
            {t("Board.Action.PreviousGame")}
          </Button>
        </Tooltip>
        <Stack gap={0} flex={1} miw={0} align="center">
          <Text size="sm" fw={600}>
            {t("Board.GameOfTotal", {
              current: formatNumber(gameNumber + 1),
              total: formatNumber(numGames),
            })}
          </Text>
          <Text size="xs" c="dimmed" truncate maw="100%">
            {getGameName(headers)}
          </Text>
        </Stack>
        <Tooltip label={`${t("Board.Action.NextGame")} (${keyMap.NEXT_GAME.keys})`}>
          <Button
            variant="default"
            disabled={!hasNext}
            onClick={nextGame}
            rightSection={<IconPlayerTrackNext size="1rem" />}
          >
            {t("Board.Action.NextGame")}
          </Button>
        </Tooltip>
      </Group>
    </>
  );
}

export default FileGameControls;
