# Development and verification

Run commands from the repository root. The runtime is a [single userscript](../chatgpt-reference-menu.user.js); there is no build step or external package dependency.

## Automated checks

Node.js is required.

```sh
node --check chatgpt-reference-menu.user.js
node chatgpt-reference-menu.test.cjs
```

Version 1.0.0 passes the syntax check and 171 regression tests. It is the first public release and has the same code as 0.12.17 apart from the version number. Tests use mocked IndexedDB, fetch, authentication and navigation to cover search, user/account isolation, catalog collection, cache commits and expiry, download scheduling, cancellation, chat resume, refresh intervals, failure counts and UI localization.

Each fully successful cache counter collapses to a single total. All added icons use Unicode characters or emoji, with no SVG paths or icon-library dependency. The refresh character `↻` is positioned by its measured ink bounds and baseline inside a fixed 18px frame. Only the frame rotates; the child glyph retains its centering offset. Font metrics are cached and recalculated when fonts finish loading. If precise measurement is unavailable, the icon pulses without rotating. Reduced-motion settings disable both animations; translated accessible names and error badges are preserved. Emoji appearance follows the platform font. Incomplete, failed or unknown totals retain the success/failure/total breakdown. All 40 UI messages have inline translations for the same ten locales as the listing. The page's HTML language takes priority; the browser languages are used when it is absent, with English as the fallback. Language changes update open controls and notices. Numbers use the selected locale's formatting.

`ReferenceFocusGate` keeps the reference list open when keyboard focus leaves it (0.12.3) and when the window loses focus (0.12.4). For keyboard focus loss it wraps only the registered menu's DOM-side React `onBlur`/`onBlurCapture` callbacks when focus leaves the menu. It preserves internal focus handling, the original props and callback context, and rechecks props during capture of blur/focusout events originating inside the menu after a rerender. It does not stop DOM focus events, reclaim focus or intercept pointer, Escape, trigger or selection handlers. Native outside clicks still dismiss the menu.

Switching windows is a separate path. ChatGPT's Radix `Menu` root registers, while open, a `useEffect` whose body adds a `window` `blur` listener (`handleBlur`) that calls `onOpenChange(false)`, and whose cleanup only removes that listener. Version 0.12.4 handles a `blur` event targeting `window` in the userscript's window capture listener, which runs before the menu's own listener. For each registered, open reference menu it walks the React fiber from the menu node to the menu provider whose `content` prop is that node, then up at most eight fibers to the nearest effect list containing a cleanup whose source is only `window.removeEventListener("blur", …)` and whose setup adds a window blur listener. It calls only that cleanup; a listener removed during dispatch is skipped. The walk stops at another menu provider, ignores cleanups that also remove other listeners (such as the Menu's keydown effect or shared hooks with resize handling), and leaves the event itself to propagate. Reopening the menu re-registers the listener, which is released again on the next window blur. If the fiber shape or cleanup source changes, nothing is released and the native close behaviour returns. `__referenceMenuFastStatus().windowBlurReleases` counts releases.

Version 0.12.5 came from a full code review. Fixes: a reference upload or deletion now invalidates the stored catalog for the same account and verified identity (catalog keys use the `AccountUserId_…` owner, not the `/me` user id, so the previous key never matched); a route change during the first catalog page, an internal timeout or an unparseable first body passes the app's own list request through instead of rejecting it; native image requests waiting on a thumbnail whose cache write cannot run fetch the image themselves; a superseded preview task stays pending instead of counting as failed; pending thumbnail access times are flushed before a scope change; a selection that stops without a result clears its verifying notice; the click gate refreshes the reference button's re-rendered hover props on the preceding element's `pointerout`/`mouseout`; and unchanged status models no longer rebuild the status line every progress tick. Refactors share React internals lookup, the react-query provider lookup, thumbnail lifetime/usability, reference file keys, catalog-session state, native request settlement, JSON responses and the storage-failure flag; icons are plain strings and the CSS uses the measured icon font. Test source hooks now assert that their targets exist. Isolated headless Chrome fixture checks showed unchanged counts (118/2/120), search, hover preview, manual refresh without image re-downloads, selection and window-blur behaviour, with no JavaScript exceptions. An IndexedDB connection that fails to open or is closed by a newer schema still stays unavailable until the page reloads.

Version 0.12.6 is a behaviour-preserving refactor. `withRetries` replaces three hand-written retry loops (large previews, catalog pages, thumbnails) with one set of rules: cancellation, `retryable === false` and caller-marked fatal errors stop immediately, other errors back off up to `CONFIG.cacheAttempts`. `CatalogSession` keeps its validated pages directly instead of re-validating them in a separate collector. The fetch wrapper only builds the request descriptor and dispatches to `handleIdentity`, `handleCatalogList` (`serveStoredCatalog`, `bootstrapCatalog`), `handleMenuImage` and `observeResponse`. Class methods call their own methods through `this`; module-level bound aliases remain only for cross-component wiring. Tests build every VM runtime through one `loadRuntime` helper and share one `Element` stub; three collector unit tests were replaced by one `CatalogSession` test (158 tests). Headless Chrome fixture checks repeated the 0.12.5 results and also covered held catalog responses with two manual refresh restarts completing all 120 references, with no JavaScript exceptions.

Version 0.12.7 reconnects the IndexedDB cache without a page reload. Previously a failed or timed-out open, a `versionchange` from another tab or clearing site data left the single connection unusable until reload. `Storage.connect()` now opens lazily and shares one in-flight open. After an open failure, requests inside the backoff window (15 s, doubling to 5 min) fail fast with the last error, and a background probe retries. A `versionchange`, `close` or `InvalidStateError` from a closing connection drops the connection, so the next request reopens at once and the probe covers idle periods. Errors caused by an unavailable connection carry `cacheConnectionFailure` and report the reason `unavailable`. On reconnect, the thumbnail disk index is reread if its first read failed. Thumbnails and large previews that were paused or failed only because the connection was unavailable are requeued. Pauses from other write errors, such as quota, keep the reload policy. `__referenceMenuFastStatus().cacheStorageReconnects` counts reconnects. In isolated headless Chrome, deleting the database from the fixture page (as clearing site data does) was followed by a reconnect that recreated schema version 2 with no remaining storage error, write pause or preview pause, and no JavaScript exceptions.

Version 0.12.8 shows the large preview for the composer's @-mention suggestions. ChatGPT renders the reference-image section as `<div data-mention-section-id="reference-images">`; each row has the React key `reference-image:<reference id>`. The highlighted row, whether moved by mouse or arrow keys, carries `aria-selected="true"` (listbox) or `aria-current="true"`. The menu observer now also watches `aria-selected` and `aria-current`. On each scheduled update, `syncMentionPreview` finds the highlighted row, maps its React key to a reference in the active catalog (checking the owner scope) and opens the shared hover preview beside the suggestion list. The preview closes when the highlight leaves, the list closes or the scope changes. It reuses the persistent preview cache. It never seeds that cache from the composer's small thumbnail image and starts no requests outside the existing reference cache, so it works only in chats where the reference cache is active. The fixture has a mock composer (`@` opens 30 suggestions; arrow keys, mouse move, Enter and Escape behave like the app). In isolated headless Chrome, the first highlighted suggestion, two arrow-key moves and a mouse move each showed the matching 255×340 preview beside the list. Escape and inserting a mention hid it, and a row without a known reference showed nothing, with no JavaScript exceptions. The suggestion structure was taken from the public bundle and has not been checked on live ChatGPT.

Version 0.12.9 extends the @-mention preview to chats without an active reference cache, such as a new chat, using only previews already stored on disk. The composer's own thumbnail is a 48×48 center-cropped WebP (the app's `chatgpt-reference-image-composer-thumbnails-v1` localStorage cache), so it cannot serve as a large preview. The disk key is rebuilt as `[scopeKey(owner, account || 'server-verified'), id, asset_pointer, thumbnail_asset_pointer]`:
- the reference id comes from the row's React key, and the owner from its `AccountUserId_…` prefix;
- the image pointers come from the suggestion icon's `assetPointer`/`thumbnailAssetPointer` props, found in the row's fiber subtree or the keyed row's content element;
- the account comes from the observed request headers, and a logged-in `/me` user is required.

A valid stored record is shown through the bounded in-memory object-URL cache. Misses are remembered for a minute. No network request, access-time update or other disk write is made, and the preview closes if the account changes. In isolated headless Chrome, after caching in one chat and moving to an unregistered chat, cached suggestions showed their 255×340 previews while an uncached suggestion showed nothing. Image requests, lookups, catalog requests and stored preview records were all unchanged, with no JavaScript exceptions.

In version 0.12.10, opening the composer's @ reference suggestions counts as opening the reference menu. When the `data-mention-section-id="reference-images"` section appears, `syncMentionPreview` calls `refreshOnOpen` once per appearance. In a saved chat, this registers the chat as the most recent of the five and starts its cache worker, or refreshes the catalog when the 30-minute interval has passed. A new chat without a saved chat ID is not registered and keeps the disk-only preview path. Nothing is added to the suggestion list. In isolated headless Chrome with a fresh profile, typing @ registered `fixture-cache` and started caching. The first highlighted suggestion showed its 255×340 preview, and all 120 thumbnails and previews completed. The suggestion list stayed free of userscript elements, and reopening @ within 30 minutes made no catalog request. The 0.12.9 new-chat check, now run at `/`, still made no request or write. There were no JavaScript exceptions.

Version 0.12.11 follows the live ChatGPT structure observed on 12 November 2026. Suggestion rows are `button[data-list-navigation-item]` inside `[data-mention-section-items]`, not listbox options, and the highlighted row carries `aria-current="true"`. A query that exactly matches a reference name shows that reference in an `exact-matches` section instead of `reference-images`. The highlighted row is therefore looked up in every `[data-mention-section-id]` section and accepted only when its React key is `reference-image:<id>`. A highlighted reference row also counts as an opened suggestion list. The fixture now uses the live row structure and the exact-match section. Live checks with the 0.12.10 install on an account with about 3,000 references:
- In an unregistered saved chat, typing @ registered the chat and started caching. Both caches verified all of about 3,000 items from disk within about 8 s, with no image downloads.
- Mouse hover and arrow keys over reference rows showed the matching large preview beside the list, and Escape hid it.
- In a new chat, the disk-only preview appeared with caching off and no image or catalog request.
- Off-screen rows render placeholders; their image pointers were still found through the keyed row's entry props.

The exact-match case was found live and fixed in this version; a live recheck with 0.12.12 showed the exact-match preview.

Version 0.12.12 answers the app's reference-list request from the stored catalog where caching does not run, such as Spaces file views, a new chat or an unregistered chat. A live check on 13 November 2026 explains why. In the Spaces image gallery the app fetches original images in bulk, and requests on the shared HTTP/2 connection waited 13–124 s in the browser queue while the server answered in 1–2 s. The @ suggestions' reference query loads every page in sequence (about 60 pages for about 3,000 references). One page took 38 s, and a single "Failed to fetch" left the whole query in an error state. `serveCatalogReadOnly` now answers a first-page request (`cursor` absent) with the whole stored list (`next_cursor: null`), using `cachedForAccount`: the same account header (or `server-verified`), the same `/me` identity, younger than 24 hours, and an owner matching the items. Read-only means it starts no caching, registers no chat, refreshes nothing and writes nothing. Cursor pages, other accounts and missing or expired catalogs pass through. The 30-minute refresh still happens only in caching chats, and `storedCatalogServes` counts these answers. In isolated headless Chrome, a `/space/file/…` path got 120 references in 3 ms with no catalog or image request and caching stayed off, while another account's request still reached the network. Live with the 0.12.12 install, a Spaces image file view's @ suggestions loaded all of about 3,000 references with no reference-list request on the network. The app query was in the success state, `storedCatalogServes` was 1 and caching stayed off. Hovering a reference showed its stored large preview with no image download, and an exact-name query showed the preview from the `exact-matches` section.

Version 0.12.13 hides ChatGPT's @-suggestion icon flicker. The app draws each suggestion icon as a 48×48 data URL and keeps it in a jotai storage cache whose coercion holds at most 50 entries (524,288 data-URL characters). A row renders its icon once it has been visible. With more than 50 icon rows mounted, each new icon evicts the oldest entry, and the evicted row re-creates its own through a `staleTime 0`/`gcTime 0` query, forever. Live, this showed as about 50 swaps per second between `<img>` and a fallback glyph, with no network requests.

`paintMentionIcons` runs with each scheduled update. For every rendered reference row in any mention section it:

- finds the icon box (`mentionIconBox`: the largest icon-sized ancestor of the image or fallback glyph);
- builds the thumbnail key from the owner scope (the active scope, or `[owner, account || 'server-verified']`) and `referenceFile` of the row's icon pointers;
- reads this script's 48px thumbnail from memory or, read-only, from IndexedDB (misses are retried after a minute, and at most 600 are kept in memory);
- appends an absolutely positioned `<img data-ref-fast-mention-icon>` over that box.

The app's icon keeps churning underneath. The observer ignores childList changes inside covered rows, so the churn no longer triggers userscript work, while highlight attributes on the rows are still observed.

The fixture models the 50-icon churn on 80 suggestion rows. In isolated headless Chrome, all 80 rows were covered in both a caching chat and a new chat while the modelled app swapped icons about 100 times in 2 s. The covering images stayed the same nodes, loaded at 48 px, lined up with the app icon box and caused no requests. Arrow-key highlighting and large previews still worked, and there were no JavaScript exceptions. Live with the 0.12.13 install, a project page's @ suggestions had 80 reference rows, and all 80 were covered. Over 3 s the app changed its icon nodes 606 times underneath, while the overlays changed 0 times. The overlays matched the 20×20 round icon slots exactly and loaded at 48 px, two screenshots a second apart showed identical icons, and the large preview stayed beside the list.

Version 0.12.14 also covers inserted reference mentions. Composer pills and mentions in sent prompts draw their icon from the same 50-entry cache, so they flickered as well. They carry `data-prompt-link-href="chatgpt-reference-image://<id>?assetPointer=…&thumbnailAssetPointer=…"`. `referencePill` parses the id and sediment pointers from that attribute, and the same overlay and observer exemption apply. ProseMirror ignores mutations inside atom nodes without content DOM, so the overlay does not disturb the editor. Raising the app's cap was considered and rejected for three reasons: it is a closure constant in ChatGPT's bundle, the cache is also limited to 524,288 data-URL characters, and it lives in localStorage (about 5 MB per origin), which is far below what all icons would need. The fixture adds pills whose icon alternates between image and fallback every 50 ms. In isolated headless Chrome, pills in a caching chat and in a new chat were covered by unchanged 48 px overlays aligned with the icon slot, with no requests and no JavaScript exceptions.

In version 0.12.15 the overlay anchors to the largest square icon-sized ancestor. Live, a composer pill wraps its 20×20 image slot in a 23×16 inline span with 3px right padding, and the 0.12.14 overlay stretched to that wrapper. Applied to the live DOM, the new rule gives the pill's 20×20 slot while leaving suggestion rows unchanged. Live with 0.12.14, the composer pill was already covered, and its overlay stayed the same node while the app icon underneath changed 8 times in 3 s. Live with 0.12.15:

- The pill overlay sits exactly on the 20×20 round slot, loaded at 48 px.
- All 80 open suggestion rows were covered.
- Over 3 s the app changed icon nodes 588 times underneath, while the overlays changed 0 times.
- Zoomed screenshots taken a second apart showed an identical, round pill icon.

Version 0.12.16 is a behaviour-preserving refactor of the composer @-mention code added since 0.12.8. It is now its own `ComposerMentions` component (`sync`, `previewStored`, `paintIcons`, `thumbnail`, `cover`), and `ReferenceMenuController` only calls `composerMentions.sync()` and asks `composerMentions.ignores()` in its observer. Shared pieces:

- `ownerScope` replaces two copies of the owner-to-scope rule;
- `reference(host)` reads id and pointers from a suggestion row or a mention pill;
- `mentionContainer` locates the anchoring list;
- `RecentMisses` replaces two hand-written "do not retry for a minute" maps;
- `previewKey` replaces a manually built preview key.

In tests, `seedCatalog` replaces duplicated disk-catalog seeding, and a `RecentMisses` test brings the total to 171. Isolated headless Chrome fixture checks gave the same results as before the refactor for the new-chat stored preview (including no traffic), the 80-row icon covers, mention pills and read-only catalog answers, with no JavaScript exceptions.

Version 0.12.17 fixes the overlay shape. On live ChatGPT, a composer pill inserted while its icon showed the fallback glyph of an evicted cache entry got a covering image with the default 4px radius, while the app image is `rounded-full`. Covers now start round (`9999px`, ChatGPT's reference icon shape) and copy the app image's exact radius once that image is present. A covered host's churn still reaches `ignores()`, which applies the shape once (`shaped`) without triggering a userscript update. An attempt to delay covering until the app image appeared was dropped, because rows that the churn never served stayed uncovered in the fixture (51 of 80). The fixture now uses round app icons, a full-size flex wrapper around the fallback glyph (as live) and pills that start with the fallback glyph. Live with 0.12.16, on a project page, all 80 @ suggestion rows were covered at 20×20 and loaded at 48 px, and the overlays did not change over 3 s while the app changed icon nodes 632 times. A pill inserted by clicking a suggestion was covered at its 20×20 slot, which showed the 4px shape fixed here. The stored large preview appeared beside the list. Nothing was sent, and the composer was cleared afterwards. The same check with 0.12.17 found:

- all 80 suggestion row overlays round (`9999px`), 20×20 and loaded at 48 px;
- no overlay changes over 3 s while the app changed icon nodes 244 times;
- the inserted pill's overlay round, matching its 20×20 slot exactly and unchanged over 3 s.

Nothing was sent, and the composer was cleared afterwards.

Version 0.11.6 added MIT licensing and translated listing metadata. The existing default name, namespace and site-storage keys remain unchanged.

Feature-specific Chrome mock-page checks cover 120 references, search and selection, previews, cache reuse after reload, chat navigation and resume, and counters in light/dark themes. These are local checks from the versions that introduced each feature. The 0.12.17 fixture checks were repeated in an isolated headless Firefox 160 profile: 118/2/120 cache counts and cache reuse after reload with no image or list request, search, the hover preview at 255×340, window blur keeping the same menu and search text (released again after reopening) while Escape still closed it, all 80 @ suggestion rows and an inserted pill covered by unchanged round 48 px overlays, the highlighted suggestion's large preview in both a caching chat and a Spaces path, a read-only stored catalog answer (120 references in 6 ms with no network request, another account still reaching the network), and a reconnect that recreated schema version 2 after the database was deleted. There were no JavaScript errors. Live ChatGPT checks in Chrome (installed versions 0.12.10–0.12.17) are recorded above; regenerate selection, manual refresh cancellation and resume have not been rechecked live, and live ChatGPT in Firefox is not yet verified. Actual regeneration time and peak RAM/CPU use with thousands of references have not been measured.

For 0.12.0, an isolated headless Chrome profile verified both cache counters at `120` after full success and `118/2/120` with two simulated failures, all ten live language switches, translated selection/preview-failure notices, and the refresh icon in light/dark themes. No JavaScript exceptions were observed. This uses the local fixture, not a live ChatGPT account.

Version 0.12.2 was checked in the same isolated Chrome fixture with every added icon rendered as a text span, four refresh rotation phases (0°, 90°, 180°, 270°), reduced-motion handling, blocked font measurement and recovery. The thresholded ink bounding-box centers varied by at most 1 raster pixel across the four phases at device scale 1. The existing counts, language changes and notices also passed, with no JavaScript exceptions.

For 0.12.3, Chrome local checks confirmed the same menu node, search text and a nonzero scroll position survive keyboard focus loss. The fixture models native blur and outside-pointer dismissal separately, so outside-click closing can be checked without a scripted replacement close path. Outside click, Escape, trigger toggling and one successful mock selection were checked. A temporary focus-callback probe also reproduced and prevented keyboard dismissal on live ChatGPT in Chrome; this was not a full test of the newly installed release.

For 0.12.4, the fixture models the Radix Menu root effects (a keyboard effect and the window blur effect) above a provider whose `content` is the menu. In an isolated headless Chrome profile, two synthetic `window` blur events kept the same menu node, search text and scroll position, released only the window blur listener and left the keyboard effect untouched. Reopening re-registered the listener and the next window blur released it again. Escape, trigger toggling, outside click and one mock selection still closed the menu, and a menu not in the open state kept the native window-blur dismissal. No JavaScript exceptions were observed. A real operating-system window switch and live ChatGPT were not tested; automated tab or key switching does not produce a verified window-focus transition.

Live with 0.12.17 (13 November 2026), I opened a project chat's used-references menu (about 3,000 items), typed the search "R01" and scrolled to 200, then dispatched a window `blur`:

- The same menu node stayed open with its search and scroll intact.
- `windowBlurReleases` became 1, so the live Radix Menu effect was found and only its window-blur cleanup ran. A second blur also left the menu open.
- Escape and an outside click still closed the menu.
- Both reference mentions in a sent prompt of that chat were covered by round icon overlays.

A real Alt+Tab window switch was not automated, but a manual window switch in Chrome with 0.12.17 also left the reference list open.

## Local mock page

The [fixture](../fixtures/reference-menu.html) blocks external service requests. Chat-scoped execution requires a `/c/<id>` URL; opening `/fixtures/reference-menu.html` directly does not exercise the full workflow.

With Python 3 installed, run the following from the repository root. It copies only the userscript and fixture into a temporary directory and serves chat-shaped paths on localhost.

```sh
python3 - <<'PYTHON'
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil

project = Path.cwd()
source = project / 'chatgpt-reference-menu.user.js'
fixture = project / 'fixtures/reference-menu.html'
assert source.is_file() and fixture.is_file(), 'Run from the project root'
with TemporaryDirectory(prefix='reference-menu-fixture-') as directory:
    root = Path(directory)
    shutil.copyfile(source, root / source.name)
    html = fixture.read_text().replace('../chatgpt-reference-menu.user.js', '/chatgpt-reference-menu.user.js')
    for chat in ('fixture-cache', 'fixture-other'):
        target = root / 'c' / chat
        target.mkdir(parents=True)
        (target / 'index.html').write_text(html)
    handler = partial(SimpleHTTPRequestHandler, directory=directory)
    print('http://127.0.0.1:8765/c/fixture-cache/?counts=1&fail=1', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8765), handler).serve_forever()
PYTHON
```

Use the "목록 밖 입력" field to check focus behavior: Shift+Tab from the search field should keep the list open, while clicking that outside field should close it and leave focus there. The fixture's close, Escape and selection actions remain independent of focus loss.

Open the printed URL in a browser. Use these query parameters:

| Parameter | Purpose |
| --- | --- |
| `counts=1&fail=1` | Use isolated sample image keys and simulate two failed references |
| `shape=wide`, `shape=tall`, `shape=square` | Change the sample image proportions |
| `hold=1` | Hold catalog responses to check cancellation and restart |
| `lang=de`, `lang=zh-TW`, etc. | Set the userscript UI language; fixture controls remain in Korean |

Use the menu refresh icon to see server-list changes immediately; cached lists otherwise follow the 30-minute refresh interval. The delete button sends a mock request and does not delete a real ChatGPT chat. Stop the server with Ctrl+C to remove the temporary directory.

## Repository files

Track source, regression tests, the fixture and public documentation. Keep local planning, handoff and work notes together in `private/`; the entire directory is excluded from Git. Shared agent instructions remain trackable.

The `.gitignore` also excludes dependencies, test output, local caches and workspace settings, logs, temporary files, environment files, private keys and browser authentication/diagnostic output. Empty `.env.example` and `.env.*.example` templates can be tracked.

Ignore rules do not remove already tracked files or historical commits. Removing a local note from the current tracked tree leaves earlier copies in Git history. Review current files and history for personal information and credentials before publishing.
