# Smart scheduling frontend

- `_solar_prediction/`: prediction components, server action, input configuration, types, and submission validation.
- `_milp/`: scheduling and appliance components, server actions, API types, configuration, browser state, and utilities.
- `_shared/components/`: location picker and map used by both areas.
- `manualsolarpredition/` and `scheduler/`: thin Next.js route entry points and scheduler layout.

Private implementation folders do not create routes. Existing URLs, including
`manualsolarpredition`, remain unchanged to preserve links and bookmarks.
Solar prediction and MILP share location UI without importing each other's implementations.
