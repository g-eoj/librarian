import { allowedBookmarkGroups, bookmarkGroups } from "../utils/appState.ts";

export interface Bookmark {
  id: string;
  url: string;
}

export interface BookmarkGroup {
  id: string;
  name: string;
  bookmarks: Bookmark[];
}

export function createBookmark(url: string): Bookmark {
  return { id: crypto.randomUUID(), url };
}

function createBookmarkGroup(name: string): BookmarkGroup {
  return { id: crypto.randomUUID(), name, bookmarks: [] };
}

export function addBookmarkToGroup(bookmark: Bookmark, group: BookmarkGroup) {
  bookmarkGroups.value = bookmarkGroups.value.map((g) =>
    g.id === group.id
      ? {
        ...g,
        bookmarks: [...g.bookmarks, bookmark],
      }
      : g
  );
}

export function addBookmarkGroup(name: string) {
  const newGroup = createBookmarkGroup(name);
  bookmarkGroups.value = [...bookmarkGroups.value, newGroup];
  allowedBookmarkGroups.value = new Set([
    ...allowedBookmarkGroups.value,
    newGroup.id,
  ]);
}

export function deleteBookmarkGroup(group: BookmarkGroup) {
  if (group && group.bookmarks.length > 0) {
    if (
      !confirm(
        `Delete "${group.name}" and its ${group.bookmarks.length} bookmarks?`,
      )
    ) {
      return;
    }
  }
  bookmarkGroups.value = bookmarkGroups.value.filter((g) => g.id !== group.id);
  allowedBookmarkGroups.value = new Set(
    [...allowedBookmarkGroups.value].filter((id) => id !== group.id),
  );
}

export function removeBookmarkFromGroup(
  bookmark: Bookmark,
  group: BookmarkGroup,
) {
  bookmarkGroups.value = bookmarkGroups.value.map((g) =>
    g.id === group.id
      ? {
        ...g,
        bookmarks: g.bookmarks.filter((b) => b.id !== bookmark.id),
      }
      : g
  );
}
