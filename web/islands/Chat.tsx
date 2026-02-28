import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

import { Answer } from "../components/Answer.tsx";
import { LoadingIndicator } from "../components/LoadingIndicator.tsx";
import { Query } from "../components/Query.tsx";
import { ControlsPanel } from "../islands/ControlsPanel.tsx";
import {
  allowBookmarkFilterEnabled,
  allowedBookmarkGroups,
  backendPort,
  baselineThinkingEffort,
  bookmarkGroups,
  dynamicThinkingEffort,
  messageHistory,
  referencesRequired,
  sessionId,
} from "../utils/appState.ts";

export default function Chat() {
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentQuery = useSignal<string | null>(null);
  const currentNode = useSignal<string | null>(null);
  const historyIndex = useSignal(-1);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isLoading = useSignal(false);
  const query = useSignal("");
  const savedInput = useSignal("");

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.ok ? res.json() : null)
      .then((config) => {
        if (config?.ports?.backend) {
          backendPort.value = config.ports.backend;
        }
      })
      .catch(() => {});
  }, []);

  const getAllowedBookmarks = () => {
    if (!allowBookmarkFilterEnabled.value) {
      return [];
    }
    return bookmarkGroups.value
      .filter((g) => allowedBookmarkGroups.value.has(g.id))
      .flatMap((g) => g.bookmarks.map((s) => s.url));
  };

  // Auto-focus input and scroll into view when loading completes
  useEffect(() => {
    if (!isLoading.value) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
    }
  }, [isLoading.value]);

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Immediately update UI
    isLoading.value = false;
    currentNode.value = null;
    currentQuery.value = null;
    inputRef.current?.focus();
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const userQuery = query.value.trim();
    if (!userQuery || isLoading.value) return;

    abortControllerRef.current = new AbortController();
    currentNode.value = "RouterNode";
    currentQuery.value = userQuery;
    isLoading.value = true;
    query.value = "";

    try {
      const response = await fetch(
        `http://localhost:${backendPort.value}/api/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: userQuery,
            session_id: sessionId.value,
            references_required: referencesRequired.value,
            allowed_sites: getAllowedBookmarks(),
            baseline_thinking_effort: baselineThinkingEffort.value,
            dynamic_thinking_effort: dynamicThinkingEffort.value,
          }),
          signal: abortControllerRef.current.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            try {
              const data = JSON.parse(line.slice(5).trim());
              if (eventType === "node") {
                currentNode.value = data.node_type;
              } else if (eventType === "answer") {
                messageHistory.value = [
                  ...messageHistory.value,
                  {
                    query: userQuery,
                    answer: String(data.answer),
                    references: data.references || [],
                  },
                ];
                currentNode.value = null;
                currentQuery.value = null;
              } else if (eventType === "error") {
                messageHistory.value = [
                  ...messageHistory.value,
                  {
                    query: userQuery,
                    answer: `Error: ${data.message}`,
                    references: [],
                  },
                ];
                currentNode.value = null;
                currentQuery.value = null;
              }
            } catch {
              // Skip malformed SSE data and continue processing
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        messageHistory.value = [
          ...messageHistory.value,
          {
            query: userQuery,
            answer: `Error: ${err.message}`,
            references: [],
          },
        ];
      }
      currentNode.value = null;
      currentQuery.value = null;
    } finally {
      isLoading.value = false;
      abortControllerRef.current = null;
      inputRef.current?.focus();
    }
  };

  return (
    <div
      class="relative h-screen flex"
      style="background-color: var(--bg-page)"
    >
      <ControlsPanel />
      <div class="flex-1 flex flex-col overflow-y-auto px-15 pt-[3%] pb-[10%]">
        {messageHistory.value.map((result, idx) => (
          <div key={idx}>
            <div class="max-w-3xl mx-auto">
              <Query query={result.query} />
              <Answer answer={result.answer} references={result.references} />
            </div>
          </div>
        ))}

        {isLoading.value && (
          <div class="max-w-3xl mx-auto w-full">
            <Query query={currentQuery.value} />
            <LoadingIndicator node={currentNode.value} onStop={handleStop} />
          </div>
        )}

        {!isLoading.value && (
          <div class="flex gap-2 max-w-3xl mx-auto w-full">
            <Query />
            <form onSubmit={handleSubmit} class="print:hidden flex-1 mt-8">
              <textarea
                autoFocus
                rows={1}
                class="chat-input"
                placeholder={messageHistory.value.length ? "" : "Enter query"}
                ref={inputRef}
                value={query.value}
                onInput={(e) => {
                  query.value = e.target.value;
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    historyIndex.value = -1;
                    savedInput.value = "";
                    handleSubmit(e);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const queries = messageHistory.value.map((r) => r.query);
                    if (queries.length === 0) return;
                    if (historyIndex.value === -1) {
                      savedInput.value = query.value;
                    }
                    const newIndex = Math.min(
                      historyIndex.value + 1,
                      queries.length - 1,
                    );
                    historyIndex.value = newIndex;
                    query.value = queries[queries.length - 1 - newIndex];
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (historyIndex.value <= 0) {
                      historyIndex.value = -1;
                      query.value = savedInput.value;
                    } else {
                      const queries = messageHistory.value.map((r) => r.query);
                      historyIndex.value -= 1;
                      query.value =
                        queries[queries.length - 1 - historyIndex.value];
                    }
                  }
                }}
              />
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
