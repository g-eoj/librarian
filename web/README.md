# Librarian — Web Frontend

Fresh 2 frontend for the Librarian local AI research assistant.

Built with [Deno](https://deno.com), [Fresh 2](https://fresh.deno.dev),
[Preact](https://preactjs.com), [Vite](https://vite.dev), and
[Tailwind CSS v4](https://tailwindcss.com).

## Prerequisites

- [Deno](https://deno.com) v2+

## Commands

```sh
deno task dev      # Start Vite dev server with HMR
deno task build    # Build for production → _fresh/
deno task start    # Run production build
deno task check    # Fmt check, lint, and typecheck
```

## Structure

```
web/
├── routes/          # File-based pages and API handlers
│   └── api/         # /api/config, /api/health
├── islands/         # Client-hydrated interactive components
│   ├── Chat.tsx         # Main chat interface (SSE streaming)
│   └── ControlsPanel.tsx # Collapsible settings sidebar
├── components/      # Server-rendered static components
├── utils/
│   ├── appState.ts  # Persisted signals (localStorage)
│   └── bookmarks.ts # Bookmark group management
└── assets/
    └── styles.css   # Tailwind + global CSS custom properties
```

## Architecture

**Islands**: Only components in `islands/` run on the client. Everything in
`components/` is server-rendered. This keeps the JS bundle small — interactivity
is opt-in per component.

**State**: Shared signals live in `utils/appState.ts`. Persistent state
(bookmark groups, controls settings, message history) is synced to
`localStorage` via `createPersistedSignal`.

**Backend connection**: The frontend connects to the Python API on the port
specified in `librarian.config.json` (read via `/api/config`). Queries stream
over SSE.
