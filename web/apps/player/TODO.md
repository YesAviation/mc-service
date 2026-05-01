# Web Player UX Improvement Plan

Execute top-to-bottom. Each section links to the files that need to change.

---

## P0 — Missing browse primitives

### 1. No Artist page exists
[App.tsx:74](src/App.tsx#L74) registers `/album/:id` but no `/artist/:id`. The backend does have artists — `catalogApi.getArtist` / `listArtists` are already wired in [catalog.ts:276-288](../../packages/shared/src/api/catalog.ts#L276-L288) — the frontend just doesn't use them.

Build: `ArtistPage.tsx` with header (photo, name, bio), "Top Tracks" (top 5 by play count), "Albums" grid (filter `listAlbums({artist_id})`), "Appears On" (singles/features), followed-by stats.

### 2. Artist names are plain text everywhere
[TrackRow.tsx:107](src/components/common/TrackRow.tsx#L107), [AlbumCard.tsx:51](src/components/common/AlbumCard.tsx#L51), [AlbumPage.tsx:135](src/pages/AlbumPage.tsx#L135) render `artist_name` as `<p>`. Not clickable. Not discoverable.

Fix: wrap in `<Link to={/artist/${artist_id}}>` wherever artist appears. Album titles in TrackRow should link to `/album/:id` (right now you can only navigate to an album from the AlbumCard in Discovery).

### 3. Discovery is curated-only — no "browse everything"
[DiscoveryPage.tsx:204-363](src/pages/DiscoveryPage.tsx#L204-L363) shows Curated Playlists → Admin Favorites → Recently Added → All Music (flat list). That's "radio," not "library." Apple Music's Browse has per-category grids.

Restructure Discovery:
- Featured (hero rail: curated + admin favorites, existing)
- Browse by sticky tab-bar: Artists | Albums | Songs | Genres | Playlists | Recently Added
- Each tab paginated grid, not a monolithic scroll. Grid cards, not rows, for Artists & Albums.
- Keep "Recently Added" section on Featured.

### 4. Search is a placeholder
[App.tsx:87-96](src/App.tsx#L87-L96) — "Search is in active development." There's no `searchApi` client and the topbar doesn't even have a search input.

Build: persistent search box in `AuthenticatedLayout`'s topbar, debounced 200ms, hitting `/api/catalog/tracks?q=…&page_size=10` + artists + albums in parallel (same pattern Apple Music uses — grouped results). Results page at `/search?q=…` with full pagination.

---

## P1 — Interaction & data gaps

### 5. HomePage hammers the backend with N+1 requests
[HomePage.tsx:189-212](src/pages/HomePage.tsx#L189-L212) does `catalogApi.getTrack(firstTrackId)` inside `.map()` for every curated playlist (up to 8). [DiscoveryPage.tsx:55-71](src/pages/DiscoveryPage.tsx#L55-L71) paginates through every track on the server (100 per page) on each Discovery visit. On a 2k-track library that's 20 round-trips + no caching — each navigation re-fetches.

Fix: add React Query (or SWR), cache per-query with a 5 min stale time. While you're there, implement the batch `/api/catalog/tracks?ids=a,b,c` endpoint (P1 #11 from the earlier plan) so the Library page stops doing one request per track.

### 6. Library uses "favorites playlist" as a single source of truth
[LibraryPage.tsx:46-69](src/pages/LibraryPage.tsx#L46-L69) conflates "my library" with one hidden "Favorites" playlist. Apple Music separates Library (added) from Favorites (hearted). Add a split: Library = added tracks; Favorites = hearted tracks. Heart icon in TrackRow toggles favorite independent of library membership.

### 7. Track row is missing standard affordances
[TrackRow.tsx](src/components/common/TrackRow.tsx) has no: artwork thumbnail, double-click-to-play, right-click context menu, "Go to artist/album" quick links in the action menu, queue-add, "Play next," "Start radio." All of these are in [TrackActionsModal] presumably — verify and promote the important ones into the row itself.

### 8. No queue UI
[PlayerBar.tsx:12](src/components/layout/PlayerBar.tsx#L12) imports `ListMusic` but I don't see a queue panel in the codebase. Users can't see/reorder what's playing next. Add a slide-over queue panel from the `ListMusic` button with drag-reorder, remove, and "Play next" vs "Play later" distinction.

### 9. No MediaSession / lock-screen metadata / headphone controls
Already on the backend plan as P1 #12. Still worth calling out — on mobile/PWA use this is a giant quality gap.

---

## P2 — Polish, visuals, discoverability

### 10. Ingestion stores multi-artist tracks as concatenated names
Live data shows: `"LE SSERAFIM; Nile Rodgers"` as a single artist row (see earlier curl to `/api/catalog/artists`). This fragments the library — same primary artist appears under dozens of collaborator permutations. Split on `;` / `feat.` / `&` at ingestion, store as `track_artists` many-to-many, and show "X feat. Y" in UI.

### 11. No genre/mood/year browsing
No genre page despite `Track.genre` being populated. Apple Music-style Genre tiles on Discovery would hit `listTracks({genre: "K-Pop"})` which already works.

### 12. Artwork fallbacks lean on `gradientFromSeed`
Looks fine on small tiles but the ArtistPage hero deserves a real blurhash or dominant-color extraction from the artwork. Add `smartcrop`/`canvas-color-thief` in the client, cache in zustand.

### 13. No virtualization on long lists
Discovery's "All Music" rendering 2000 TrackRows (P1 #19 from earlier plan). Already noted in backend plan but it bites the UX directly.

### 14. No empty-state polish
Library empty state is a flat message ([LibraryPage.tsx:183-189](src/pages/LibraryPage.tsx#L183-L189)). Should include a "Browse recommended" CTA button linking to Discovery, maybe show 3 sample album covers.

### 15. No dark/light toggle or accent-color personalization
The accent color is baked in via Tailwind. One setting to customize it (user preference stored in `/api/users/me/preferences`) is a small, high-delight touch.

### 16. Topbar is mostly empty
[App.tsx:40-63](src/App.tsx#L40-L63) — just a profile avatar. Should host: search input (see #4), breadcrumbs / back-forward (currently only AlbumPage has Back), notification bell (once the notification service ships).

### 17. Mobile nav is a horizontal scroll strip
[Sidebar.tsx:181-203](src/components/layout/Sidebar.tsx#L181-L203) — on phone, Home/Discovery/Library are squeezed into a scrolling bar. A bottom tab-bar (Apple Music iOS pattern) is the expected mobile chrome.

---

## Suggested execution order

1. **Artist page + everywhere-clickable artist/album** (items #1, #2) — smallest diff, unblocks the biggest "this feels broken" complaint.
2. **Browse tabs on Discovery** (item #3) — pattern-matches Apple Music.
3. **Search topbar + results page** (item #4) — once search service is real, or client-side filter as a temporary stub.
4. **React Query + batch catalog endpoint** (item #5) — speeds up everything.
5. **Queue panel + MediaSession** (items #8, #9) — playback UX wins.
6. Rest as rolling polish.
