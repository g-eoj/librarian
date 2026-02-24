import { signal } from "@preact/signals";
import {
  ControlAddButton,
  ControlNumberInput,
  ControlNumberSlider,
  ControlRow,
  ControlSection,
  ControlToggle,
} from "../components/Controls.tsx";
import { addBookmarkGroup } from "../utils/bookmarks.ts";
import {
  aiSectionOpen,
  allowBookmarkFilterEnabled,
  baselineThinkingEffort,
  bookmarkGroups,
  clearMemory,
  dynamicThinkingEffort,
  referencesRequired,
  searchSectionOpen,
} from "../utils/appState.ts";
import { BookmarkGroupRow } from "../components/BookmarkGroupRow.tsx";
import { HealthStatus } from "../components/HealthStatus.tsx";

const collapsed = signal(false);

const collapsedPanelArrow = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    class="w-5 h-5"
  >
    <path
      fill-rule="evenodd"
      d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
      clip-rule="evenodd"
    />
  </svg>
);

export function ControlsPanel() {
  if (collapsed.value) {
    return (
      <div
        class="controls-panel flex items-center pl-1 pr-2 cursor-pointer"
        onClick={() => (collapsed.value = false)}
        title="Expand controls"
      >
        {collapsedPanelArrow}
      </div>
    );
  }

  return (
    <div class="controls-panel relative border-r overflow-y-auto overflow-x-hidden flex-shrink-0 w-100">
      <button
        type="button"
        onClick={() => (collapsed.value = true)}
        class="absolute top-2 right-2 p-1 transition-colors"
        style="color: var(--color-muted)"
        title="Close controls"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="w-4 h-4"
        >
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
      <div class="p-8 space-y-16">
        {/* Header */}
        <h1>Controls</h1>

        {/* AI */}
        <ControlSection title="Artificial Intelligence" open={aiSectionOpen}>
          <HealthStatus />
          <ControlRow
            label="Baseline Thinking Effort"
            description="Affects the time it takes to answer queries."
            stacked
          >
            <ControlNumberSlider
              value={baselineThinkingEffort}
              stops={[
                { label: "low", value: 1 },
                { label: "medium", value: 5 },
                { label: "high", value: 8 },
              ]}
            />
          </ControlRow>
          <ControlRow
            label="Dynamic Thinking Effort"
            description="Adaptively increase above baseline thinking effort depending on the task at hand."
          >
            <ControlToggle value={dynamicThinkingEffort} />
          </ControlRow>
          <ControlRow label="Forget">
            <button
              type="button"
              onClick={() => clearMemory()}
              title="Clear memory"
              class="controls-action-btn flex items-center justify-center"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="2 3 16 14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                class="w-3 h-3"
              >
                <line x1="4" y1="5" x2="7" y2="8" />
                <line x1="7" y1="5" x2="4" y2="8" />
                <line x1="13" y1="5" x2="16" y2="8" />
                <line x1="16" y1="5" x2="13" y2="8" />
                <line x1="6" y1="15" x2="14" y2="15" />
              </svg>
            </button>
          </ControlRow>
        </ControlSection>

        {/* Search */}
        <ControlSection title="Search" open={searchSectionOpen}>
          <ControlRow
            label="References Required"
            description="Minimum source URLs per answer."
          >
            <ControlNumberInput value={referencesRequired} min={1} max={5} />
          </ControlRow>
          <ControlRow
            label="Filter by Bookmark Groups"
            description="Only read URLs from active bookmark groups."
          >
            <ControlToggle value={allowBookmarkFilterEnabled} />
          </ControlRow>
          <ControlRow label="Bookmark Groups" stacked>
            <ControlAddButton onAdd={addBookmarkGroup} />
            {bookmarkGroups.value.map((group) => (
              <BookmarkGroupRow key={group.id} group={group} />
            ))}
          </ControlRow>
        </ControlSection>
      </div>
    </div>
  );
}
