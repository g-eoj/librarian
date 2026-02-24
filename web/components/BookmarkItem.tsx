import {
  Bookmark,
  BookmarkGroup,
  removeBookmarkFromGroup,
} from "../utils/bookmarks.ts";

export function BookmarkItem(
  props: { bookmark: Bookmark; group: BookmarkGroup; filterActive?: boolean },
) {
  return (
    <div
      key={props.bookmark.id}
      class="bookmark-item flex items-center gap-1 text-sm font-light overflow-hidden ml-2 mt-1 min-w-0"
      style="color: var(--color-muted)"
    >
      <a
        href={props.bookmark.url}
        target="_blank"
        rel="noopener"
        title={props.bookmark.url}
        class={`truncate flex-1 hover:underline bookmark-url ${
          props.filterActive ? "bookmark-url-active" : ""
        }`}
      >
        {props.bookmark.url.replace(/^https?:\/\/(www\.)?/, "").replace(
          /\/$/,
          "",
        )}
      </a>
      <button
        type="button"
        onClick={() => removeBookmarkFromGroup(props.bookmark, props.group)}
        class="p-0.5 danger-btn"
        title="Remove bookmark"
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
  );
}
