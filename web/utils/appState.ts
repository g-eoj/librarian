import { effect, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { BookmarkGroup } from "../utils/bookmarks.ts";

// Helper for persisted signals at module level (not a hook)
function createPersistedSignal<T, S = T>(
  key: string,
  initial: T,
  serialize: (v: T) => S = (v) => v as unknown as S,
  deserialize: (v: S) => T = (v) => v as unknown as T,
) {
  let valueToUse = initial;

  if (IS_BROWSER) {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        valueToUse = deserialize(JSON.parse(stored));
      } catch {
        localStorage.removeItem(key);
      }
    }
  }

  const sig = signal(valueToUse);

  if (IS_BROWSER) {
    effect(() => {
      localStorage.setItem(key, JSON.stringify(serialize(sig.value)));
    });
  }

  return sig;
}

// Signals

export const backendPort = signal(8001);

export const allowBookmarkFilterEnabled = createPersistedSignal<boolean>(
  "allow-filter-enabled",
  false,
);

export const allowedBookmarkGroups = createPersistedSignal<
  Set<string>,
  string[]
>(
  "allowed-bookmark-groups",
  new Set(),
  (s) => [...s],
  (a) => new Set(a),
);

export const bookmarkGroups = createPersistedSignal<BookmarkGroup[]>(
  "bookmark-groups",
  [],
);

interface QueryResult {
  query: string;
  answer: string;
  references: string[];
}

export const messageHistory = createPersistedSignal<QueryResult[]>(
  "message-history",
  [],
);

export const sessionId = createPersistedSignal<string>(
  "fireside-session-key",
  IS_BROWSER ? crypto.randomUUID() : "",
);

export const referencesRequired = createPersistedSignal<number>(
  "references-required",
  1,
);

export const baselineThinkingEffort = createPersistedSignal<number>(
  "baseline-thinking-effort",
  5,
);

export const dynamicThinkingEffort = createPersistedSignal<boolean>(
  "dynamic-thinking-effort",
  true,
);

export const aiSectionOpen = createPersistedSignal<boolean>(
  "controls-ai-section-open",
  true,
);

export const searchSectionOpen = createPersistedSignal<boolean>(
  "controls-search-section-open",
  true,
);

export function clearMemory() {
  if (!IS_BROWSER) return;

  // Clear backend session
  if (sessionId.value) {
    fetch(
      `http://localhost:${backendPort.value}/api/session/${sessionId.value}`,
      {
        method: "DELETE",
      },
    ).catch(() => {});
  }

  // Clear frontend message history
  messageHistory.value = [];
}
