import { appDataDir, resolve } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, rename, writeTextFile } from "@tauri-apps/plugin-fs";
import { info, warn } from "@tauri-apps/plugin-log";
import { z } from "zod";
import { tabSchema } from "@/utils/tabs";
import { flushPendingWrites } from "./store/debouncedStorage";

// Open tabs and their game trees (with every variation) live in sessionStorage,
// which is wiped when the app quits. This mirrors them to a file in the app data
// directory and puts them back on the next launch.

const SESSION_FILE = "tab-session.json";
const SAVE_INTERVAL_MS = 1000;

const tabSessionSchema = z.object({
    version: z.literal(1),
    tabs: z.array(tabSchema),
    activeTab: z.string().nullable(),
    // Raw sessionStorage values of each tab's tree store, keyed by tab id.
    trees: z.record(z.string(), z.string()),
});

type TabSession = z.infer<typeof tabSessionSchema>;

async function getSessionFile() {
    return resolve(await appDataDir(), SESSION_FILE);
}

function readSessionStorage(): TabSession | null {
    flushPendingWrites();
    const rawTabs = sessionStorage.getItem("tabs");
    if (rawTabs === null) return null;

    let tabs;
    try {
        tabs = z.array(tabSchema).safeParse(JSON.parse(rawTabs));
    } catch {
        return null;
    }
    if (!tabs.success) return null;

    let activeTab: string | null = null;
    try {
        activeTab = JSON.parse(sessionStorage.getItem("activeTab") ?? "null");
    } catch {
        // keep null
    }

    const trees: Record<string, string> = {};
    for (const tab of tabs.data) {
        const tree = sessionStorage.getItem(tab.value);
        if (tree !== null) trees[tab.value] = tree;
    }
    return { version: 1, tabs: tabs.data, activeTab, trees };
}

function isSameSession(a: TabSession | null, b: TabSession) {
    if (!a || a.activeTab !== b.activeTab) return false;
    if (JSON.stringify(a.tabs) !== JSON.stringify(b.tabs)) return false;
    const keys = Object.keys(b.trees);
    return (
        keys.length === Object.keys(a.trees).length && keys.every((k) => a.trees[k] === b.trees[k])
    );
}

/** Call before the app renders. Does nothing after a reload, when sessionStorage still has the tabs. */
export async function restoreTabSession() {
    if (sessionStorage.getItem("tabs") !== null) return;
    try {
        const file = await getSessionFile();
        if (!(await exists(file))) return;
        const parsed = tabSessionSchema.safeParse(JSON.parse(await readTextFile(file)));
        if (!parsed.success) {
            warn(`Ignoring invalid ${SESSION_FILE}: ${parsed.error}`);
            return;
        }

        const { tabs, activeTab, trees } = parsed.data;
        if (tabs.length === 0) return;
        for (const [id, tree] of Object.entries(trees)) {
            sessionStorage.setItem(id, tree);
        }
        sessionStorage.setItem("tabs", JSON.stringify(tabs));
        const active = tabs.some((tab) => tab.value === activeTab) ? activeTab : tabs[0].value;
        sessionStorage.setItem("activeTab", JSON.stringify(active));
        info(`Restored ${tabs.length} tabs from the previous session`);
    } catch (e) {
        warn(`Failed to restore tabs: ${e}`);
    }
}

/** Keeps the session file in sync with the open tabs. */
export function startTabSessionAutosave() {
    let lastSaved: TabSession | null = null;
    let queue = Promise.resolve();

    const save = async () => {
        const session = readSessionStorage();
        if (!session || isSameSession(lastSaved, session)) return;
        try {
            const dir = await appDataDir();
            if (!(await exists(dir))) {
                await mkdir(dir, { recursive: true });
            }
            const file = await getSessionFile();
            // Write then rename, so quitting mid-write never leaves a corrupt file.
            await writeTextFile(`${file}.tmp`, JSON.stringify(session));
            await rename(`${file}.tmp`, file);
            lastSaved = session;
        } catch (e) {
            warn(`Failed to save tabs: ${e}`);
        }
    };
    const queueSave = () => {
        queue = queue.then(save);
    };

    setInterval(queueSave, SAVE_INTERVAL_MS);
    window.addEventListener("blur", queueSave);
}
