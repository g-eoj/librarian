import {
  addBookmarkToGroup,
  BookmarkGroup,
  createBookmark,
  deleteBookmarkGroup,
} from "../utils/bookmarks.ts";
import {
  allowBookmarkFilterEnabled,
  allowedBookmarkGroups,
} from "../utils/appState.ts";
import { BookmarkItem } from "./BookmarkItem.tsx";
import { ControlInlineAdd } from "./Controls.tsx";

export function BookmarkGroupRow({ group }: { group: BookmarkGroup }) {
  return (
    <details key={group.id} class="bookmark-group min-w-0">
      <summary class="cursor-pointer list-none flex items-center justify-between">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            class={allowBookmarkFilterEnabled.value ? "checkbox-active" : ""}
            checked={allowedBookmarkGroups.value.has(group.id) || false}
            onClick={(e) => {
              e.stopPropagation();
              const next = new Set(allowedBookmarkGroups.value);
              if (next.has(group.id)) {
                next.delete(group.id);
              } else next.add(group.id);
              allowedBookmarkGroups.value = next;
            }}
          />
          <h3>{group.name}</h3>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-3 h-3 bookmark-group-chevron"
          >
            <path
              fill-rule="evenodd"
              d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              deleteBookmarkGroup(group);
            }}
            class="p-0.5 danger-btn"
            title="Delete group"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-3 h-3"
            >
              <path
                fill-rule="evenodd"
                d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </summary>
      <div class="space-y-1 mt-1 overflow-hidden min-w-0">
        {group.bookmarks.map((bookmark) => (
          <BookmarkItem
            key={bookmark.id}
            bookmark={bookmark}
            group={group}
            filterActive={allowBookmarkFilterEnabled.value &&
              allowedBookmarkGroups.value.has(group.id)}
          />
        ))}
        <ControlInlineAdd
          onAdd={(url) => addBookmarkToGroup(createBookmark(url), group)}
        />
      </div>
    </details>
  );
}
