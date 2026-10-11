import { useToggle } from "@mantine/hooks";
import { useAtom, useSetAtom } from "jotai";
import { use, useCallback, useState } from "react";
import { useStore } from "zustand";
import { commands } from "@/bindings";
import { TreeStateContext } from "@/components/common/TreeStateContext";
import { currentTabAtom, setRecentFileGameAtom } from "@/state/atoms";
import { parsePGN } from "@/utils/chess";
import { getTabFile, getTabGameNumber } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";

/**
 * Switching between the games of the PGN file open in the current tab.
 * Render a ConfirmChangesModal with `confirmChanges` / `toggleConfirmChanges` /
 * `confirmPendingPage` to ask before discarding unsaved changes.
 */
export function useFileGameNavigation() {
    const store = use(TreeStateContext)!;
    const dirty = useStore(store, (s) => s.dirty);
    const setState = useStore(store, (s) => s.setState);
    const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
    const setRecentFileGame = useSetAtom(setRecentFileGameAtom);

    const [confirmChanges, toggleConfirmChanges] = useToggle();
    const [pendingPage, setPendingPage] = useState(0);

    const tabFile = getTabFile(currentTab);
    const gameNumber = getTabGameNumber(currentTab);
    const numGames = tabFile?.numGames ?? 0;
    const filePath = tabFile?.path;

    const setPage = useCallback(
        async (page: number, forced?: boolean) => {
            if (!filePath) return;
            if (!forced && dirty) {
                setPendingPage(page);
                toggleConfirmChanges();
                return;
            }

            const data = unwrap(await commands.readGames(filePath, page, page));
            const tree = await parsePGN(data[0]);
            setState(tree);

            setCurrentTab((prev) => {
                if (prev.gameOrigin.kind !== "file" && prev.gameOrigin.kind !== "temp_file") {
                    return prev;
                }
                return {
                    ...prev,
                    gameOrigin: {
                        ...prev.gameOrigin,
                        gameNumber: page,
                    },
                };
            });
            setRecentFileGame({ path: filePath, gameNumber: page });
        },
        [filePath, dirty, toggleConfirmChanges, setState, setCurrentTab, setRecentFileGame],
    );

    const hasPrevious = gameNumber > 0;
    const hasNext = gameNumber < numGames - 1;

    const previousGame = useCallback(() => {
        if (hasPrevious) void setPage(gameNumber - 1);
    }, [hasPrevious, setPage, gameNumber]);

    const nextGame = useCallback(() => {
        if (hasNext) void setPage(gameNumber + 1);
    }, [hasNext, setPage, gameNumber]);

    return {
        tabFile,
        gameNumber,
        numGames,
        setPage,
        previousGame,
        nextGame,
        hasPrevious,
        hasNext,
        confirmChanges,
        toggleConfirmChanges,
        confirmPendingPage: () => void setPage(pendingPage, true),
    };
}
