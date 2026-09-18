/**
 * Load user keybindings from `<appDataDir>/keybindings.json` at startup.
 *
 * This is the file-based counterpart of Settings > Keyboard > Import/Export:
 * it accepts the same `lithe.keybindings` v1 payload, as well as the bare
 * array form (`[{ "key": "ctrl+alt+b", "command": "editor.goToImplementation" }]`).
 * Every entry is normalized to a `source: "user"` override, so the file always
 * wins over preset and default bindings (see `effective-keymaps.ts`).
 *
 * Behavior notes:
 * - Missing file is a no-op (first launch / user never customized).
 * - Invalid JSON or an unrecognized shape is ignored with a warning; boot continues.
 * - `keybindingPreset` in the file is intentionally ignored at boot. Presets stay
 *   managed by the settings store to avoid racing settings initialization.
 * - The zustand-persist rehydration (localStorage) is awaited first so a late
 *   rehydrate merge cannot clobber the file entries.
 *
 * Example `keybindings.json` (lives next to `settings.json` in the app data dir):
 * ```json
 * {
 *   "format": "lithe.keybindings",
 *   "version": 1,
 *   "exportedAt": "2026-09-18T00:00:00.000Z",
 *   "keybindingPreset": "none",
 *   "keybindings": [
 *     {
 *       "key": "ctrl+alt+b",
 *       "command": "editor.goToImplementation",
 *       "source": "user",
 *       "enabled": true,
 *       "when": "editorFocus"
 *     }
 *   ]
 * }
 * ```
 */

import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { useKeymapStore } from "../stores/keymaps.store";
import { parseKeybindingsImportJson } from "../utils/keybinding-import-export";

export const USER_KEYBINDINGS_FILE_NAME = "keybindings.json";

export async function resolveUserKeybindingsFilePath(): Promise<string> {
  return join(await appDataDir(), USER_KEYBINDINGS_FILE_NAME);
}

async function readUserKeybindingsFileText(filePath: string): Promise<string | null> {
  let present = false;
  try {
    present = await exists(filePath);
  } catch (error) {
    console.warn(`[Keymaps] Failed to check ${filePath}:`, error);
    return null;
  }
  if (!present) return null;

  try {
    return await readTextFile(filePath);
  } catch (error) {
    console.warn(`[Keymaps] Failed to read ${filePath}:`, error);
    return null;
  }
}

/**
 * Read and apply the user keybindings file.
 * @returns the number of bindings applied (0 when the file is missing/invalid).
 * Never throws: a broken file must not break app startup.
 */
export async function applyUserKeybindingsFile(): Promise<number> {
  try {
    // Await rehydration when the persist API is available (it is absent when
    // zustand found no storage, e.g. unit tests without localStorage). This
    // prevents a late rehydrate merge from clobbering the file entries.
    await useKeymapStore.persist?.rehydrate?.();

    const filePath = await resolveUserKeybindingsFilePath();
    const text = await readUserKeybindingsFileText(filePath);
    if (text === null) return 0;

    let imported;
    try {
      imported = parseKeybindingsImportJson(text);
    } catch {
      imported = null;
    }
    if (!imported) {
      console.warn(`[Keymaps] Ignoring ${filePath}: unrecognized keybindings format.`);
      return 0;
    }

    const { addKeybinding } = useKeymapStore.getState().actions;
    for (const binding of imported.keybindings) {
      addKeybinding(binding);
    }
    if (imported.keybindingPreset) {
      console.info(
        `[Keymaps] Loaded ${imported.keybindings.length} binding(s) from ${filePath}; ` +
          `keybindingPreset in the file is ignored, manage presets in Settings.`,
      );
    }
    return imported.keybindings.length;
  } catch (error) {
    console.warn("[Keymaps] Failed to apply user keybindings file:", error);
    return 0;
  }
}
