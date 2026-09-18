import { beforeEach, expect, mock, test } from "bun:test";

let fileExists = false;
let fileText = "";
let readError: Error | null = null;

mock.module("@tauri-apps/api/path", () => ({
  appDataDir: async () => "C:/mock/appdata",
  join: async (...parts: string[]) => parts.join("/").replace(/\/+/g, "/"),
}));

mock.module("@tauri-apps/plugin-fs", () => ({
  exists: async (_path: string) => fileExists,
  readTextFile: async (_path: string) => {
    if (readError) throw readError;
    return fileText;
  },
}));

const { applyUserKeybindingsFile } = await import("./keybindings-file");
const { useKeymapStore } = await import("../stores/keymaps.store");

beforeEach(() => {
  fileExists = false;
  fileText = "";
  readError = null;
  useKeymapStore.getState().actions.resetToDefaults();
  mock.restore();
});

test("missing file is a no-op", async () => {
  fileExists = false;

  const applied = await applyUserKeybindingsFile();

  expect(applied).toBe(0);
  expect(useKeymapStore.getState().keybindings).toEqual([]);
});

test("applies a lithe.keybindings export payload as user overrides", async () => {
  fileExists = true;
  fileText = JSON.stringify({
    format: "lithe.keybindings",
    version: 1,
    exportedAt: "2026-09-18T00:00:00.000Z",
    keybindingPreset: "none",
    keybindings: [
      {
        key: "ctrl+alt+b",
        command: "editor.goToImplementation",
        source: "user",
        enabled: true,
        when: "editorFocus",
      },
    ],
  });

  const applied = await applyUserKeybindingsFile();

  expect(applied).toBe(1);
  expect(useKeymapStore.getState().keybindings).toEqual([
    {
      key: "ctrl+alt+b",
      command: "editor.goToImplementation",
      source: "user",
      enabled: true,
      when: "editorFocus",
    },
  ]);
});

test("accepts the bare array form", async () => {
  fileExists = true;
  fileText = JSON.stringify([{ key: "ctrl+alt+b", command: "editor.goToImplementation" }]);

  const applied = await applyUserKeybindingsFile();

  expect(applied).toBe(1);
  expect(useKeymapStore.getState().keybindings).toEqual([
    { key: "ctrl+alt+b", command: "editor.goToImplementation", source: "user", enabled: true },
  ]);
});

test("invalid JSON is ignored without throwing", async () => {
  fileExists = true;
  fileText = "{not-json";

  const applied = await applyUserKeybindingsFile();

  expect(applied).toBe(0);
  expect(useKeymapStore.getState().keybindings).toEqual([]);
});

test("unrecognized shape is ignored without throwing", async () => {
  fileExists = true;
  fileText = JSON.stringify({ foo: 1 });

  const applied = await applyUserKeybindingsFile();

  expect(applied).toBe(0);
  expect(useKeymapStore.getState().keybindings).toEqual([]);
});

test("read errors are ignored without throwing", async () => {
  fileExists = true;
  readError = new Error("denied");

  const applied = await applyUserKeybindingsFile();

  expect(applied).toBe(0);
  expect(useKeymapStore.getState().keybindings).toEqual([]);
});

test("file entry replaces an existing override for the same command", async () => {
  useKeymapStore.getState().actions.addKeybinding({
    key: "cmd+F12",
    command: "editor.goToImplementation",
    source: "user",
    enabled: true,
  });
  fileExists = true;
  fileText = JSON.stringify([{ key: "ctrl+alt+b", command: "editor.goToImplementation" }]);

  const applied = await applyUserKeybindingsFile();

  expect(applied).toBe(1);
  expect(useKeymapStore.getState().keybindings).toEqual([
    { key: "ctrl+alt+b", command: "editor.goToImplementation", source: "user", enabled: true },
  ]);
});
