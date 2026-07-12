## v0.7.4 - 2026-07-12
- New vector basemap and a redesigned thumbnail basemap picker
- Legacy map style now works with terrain and satellite, with labels drawn above Street View coverage
- New map styles: Arctic, Ember, Forest, Noir, Dusk
- Map settings toggles to hide POIs, transit, highways, and road labels
- Bulk panorama download
- Command to pick an evenly spaced subset of a selection
- Pivot plugin: percentage modes, value shading, smarter bucketing, ctrl-click column selection
- Gradient plugin: reverse toggle and steadier layout
- Plugin sidebars remember their state between visits
- Enrichment and field management unified into a single dialog in the editor header
- Animated tag reordering, with improved drag UX
- Faster large-file imports, and the map no longer stalls while an import auto-commits
- Cleaned up settings, status bar, and map-type menus
- Fixed one failing location aborting bulk validation
- Fixed mouse wheel not scrolling dropdowns inside dialogs
- Fixed clicks while measuring opening locations instead
- Fixed Enter in the map list opening a loosely-matching map
- Fixed pasting a single location zooming all the way in
- Fixed overlapping zoom buttons in the panorama viewer

## v0.7.3 - 2026-07-05
- Bulk operations now show throughput (items/sec) and elapsed time
- Copyright plugin is more accurate
- Plugin sidecar downloads are now verified against release checksums
- Fixed deleted metadata fields reappearing after saving
- Fixed unofficial panoramas failing to load
- Fixed metadata field labels showing incorrect capitalization
- Fixed plugin sidecar processes not always shutting down on exit

## v0.7.2 — 2026-07-03
- Fixed sidecar plugins opening a console window on Windows

## v0.7.1 — 2026-07-03
- Poisson disk, blue line coverage, and BFS kernel sampling modes for the map generator
- Vali generate and download can now be cancelled mid-operation
- Welcome dialog on first launch with links to the manual and Discord
- Discord and manual shortcut buttons on the map list screen
- App is now referred to as "Map Making App" in the UI
- Fixed plugin type declarations exporting mangled names
- Fixed map list scrollbar visible behind the manual

## v0.7.0 — 2026-07-03
- **Vali generation is now 5x faster, runs directly in the sidebar, and requires no additional installation**
- **New Vision plugin: search your locations by describing what they look like, or find ones that look alike**
- **New Copyright Year plugin: read the copyright year Google stamps on Street View imagery**
- Plugins with companion tools now download and update them straight from the plugin manager
- More built-in map style presets
- Setting to choose a default color for markers
- Map generator option to skip locations you already have
- iNaturalist plugin can auto-sort observations by taxonomy
- Setting to reopen your previously open maps on next launch
- Tag aliases in the tag tree
- Searchable aliases for command palette commands
- Support for typing directly into date pickers
- Unknown field names now display with sentence-case labels
- Faster nearby and radius location lookups
- Inverting a nested selection now works at any depth in the selection tree
- Fixed plugin manager UI flash for "Additional" tab
- Fixed the map not zooming out fully on wide windows
- Fixed the map generator's coverage search being offset

## v0.6.8 — 2026-06-29
- Choose where your map data is stored on disk
- Tag names are shortened to their shortest unique path in tree view
- Fixed country and subdivision selection failing when its border data wasn't downloaded yet
- Fixed a rendering glitch when opening dropdowns in Settings

## v0.6.7 — 2026-06-28
- Vastly improved support for tag folders
- Renaming a tag folder now cascades to all the tags within it
- Alt+click a tag in the tree to isolate just that one, ignoring its sub-tags
- Adjustable spacing between tags in the tag list
- Minimap now stays available in fullscreen and follows the panorama outside the viewport
- Date picker now available in fullscreen
- Colorable map list labels
- Import folder assignments from the web app via .mmafolders files
- Fixed the expanded minimap pushing its controls off-screen when the window is maximized
- Fixed 0m duplicate checks freezing on large maps
- Fixed progress bars and live updates not working in the web version
- Fixed copying a location to a map open in another window not updating that map's tag counts
- Fixed manual reviews unexpectedly resuming
- Fixed the panorama view shifting when entering fullscreen
- Fixed memory not being freed when a bulk import is cancelled

## v0.6.6 — 2026-06-26
- Variable marker size slider
- iNaturalist plugin
- "Use latest panorama" option in bulk pin-to-pano
- Option for Google panorama as reverse geocode provider
- Street View thumbnail embedded in copied pano share links
- Progress bars for long-running operations
- Select multiple files at once in bulk import
- Close map shortcut
- Faster imports on large files
- Fixed arrow markers rendering with a gap in their shape
- Fixed tooltips staying open when hovering over them
- Fixed country and state codes being lost during import
- Fixed bulk export changing field order
- Fixed checkboxes in bulk import not responding to clicks
- Fixed review session buttons invisible on white background
- Fixed pinned command forms not sorted by pinned order
- Fixed scrollbar causing layout shift
- Fixed F11 fullscreen not working in the web version
- Fixed zip import not working in the web version

## v0.6.5 — 2026-06-24
- Coverage dates enrichment field with array type filtering
- Faster imports
- Tooltips migrated to Radix
- Map generator shows a summary of active settings
- Improved description search layout in map generator
- Long tag names truncate by width
- Fixed keyboard shortcuts not working while a slider has focus
- Fixed folder renames not working for empty folders
- Fixed tag autocomplete scrollbar showing incorrectly
- Fixed release notes text justification

## v0.6.4 — 2026-06-23
- Bound panorama dots to evict, preventing performance degradation over time
- Add icons to remaining selection commands

## v0.6.3 — 2026-06-23
- Redesigned map overview UI
- Add command to open a different map without leaving the window
- Toggleable overlay showing all seen locations on the map
- Quickly copy a location to another map
- Folders in the map list remember their collapsed state
- Select uncommitted locations
- Select reviewed locations across every review session at once
- Rename review sessions, and single-selection reviews are now named after their selection
- Redesigned review sessions window with dates
- Optional cursor overlay showing the click search radius
- Filter by the top or bottom K values of a field
- Filter by heading, pitch, and zoom
- "Filter by metadata" now applies when you press Enter
- Enrichment status is now field-aware
- Locations now show created and modified timestamps in the editor
- Extra field keys are now sorted alphabetically
- Improved metadata details UI
- New selection dropdown styling and saved selection dialogs
- Pinned command context menu and default pinned commands
- Free-aspect-ratio split view with smoother resizing
- Edit generator regions while a job is running, with buffered finds flushed on pause or stop
- Improved Street View pano dot rendering
- Faster bulk metadata operations
- Fixed seen-matching using location IDs instead of pano IDs
- Fixed edge cases where exact date matching did not run when the setting was enabled
- Fixed a location's date being wrong after moving within a panorama, if the location had a cached datetime
- Fixed deleted maps showing up in the seen filter dropdown
- Fixed modified time not updating on location edits
- Fixed undo back to the original state marking a location as uncommitted
- Fixed map overview losing its state when switching work areas
- Fixed validation handling of the load-as-pano-ID flag

## v0.6.2 — 2026-06-20

- Select admin-1 subdivisions on the map
- Customizable pano dot color and size
- Filter locations by tag count
- Alt-click to isolate a ghosted selection
- Add partition primitives to gradient plugin, "apply metadata as tags"
- Tag suggestion limit setting
- Plugin update mechanism in the marketplace + slightly better marketplace UI
- Fix map generator plugin UI
- "What's new" panel marks versions you haven't updated to yet
- Fixed arrows facing the wrong direction on the map
- Fixed Shift-modified hotkeys not firing
- Fixed date-based gradients and tag partitions ignoring time zone
- Fixed the fullscreen tag bar losing focus
- Fixed unsaved tags persisting when staging a location's tags
- Fixed the weather plugin not reporting progress

## v0.6.1 — 2026-06-18

- Minimap now mirrors the editor map
- "What's new" panel in the map list, with per-version history
- Added search-coverage overlay while generating
- Color a subset of locations by gradient, bucketed within that subset
- Allow deleting a map from inside the editor
- Toggle a selection's ghost state from its row
- Hold-and-click hotkey to delete the polygon under the cursor
- Copy-link modifiers: hold Shift to copy without tags, Alt for the long URL
- Allow pasting a location into the search box
- Text-match dropdown when bulk-adding a tag
- Arrow-key navigation through autocomplete suggestions
- Window title now shows the open map
- Tag order is kept when exporting and re-importing JSON
- Autocomplete and quicktags follow your tag sort order
- Optimized request concurrency/throughput
- Map generator can search within descriptions and filter by number of links
- Map generator gained a fixed output zoom and a speed setting
- Map generator applies settings changes mid-run
- Fixed the map generator losing its session when switching views
- Fixed edits to a selection to become an existing selection replacing it instead of merging into it
- Fixed inaccurate counts on ghosted selections
- Fixed the fullscreen minimap and tag bar ignoring the hide-UI hotkey
- Fixed a rendering issue on Linux

## v0.6.0 — 2026-06-12

- Per-map hotkeys: assign keys to tags and to copying the active location to other maps
- Select-only mode toggle - map clicks never add locations
- Paste lists of Google Maps URLs to import
- Staged import locations preview on the map before being added, with a configurable marker color
- Apply metadata as tags can group dates by year, month, or day, and bucket numbers
- Filter exact dates in the location's own timezone
- A date pick in filters now means the whole day, with a clear-time button on the picker
- Step date and number window filters period-by-period from the selection row
- Copy buttons between min and max filter values
- Bulk set-field accepts expressions, e.g. mod(heading + 180, 360)
- Prune duplicates on a duplicates selection
- Legacy map style
- Tags reorder live while dragging
- Save-as-tag pre-fills the selection name
- Hotkey to fully zoom out the panorama
- Better trekker coverage detection
- Faster commits on large maps
- Faster selection syncing and tag list on maps with many tags
- Fixed a possible crash when committing after undoing edits
- Fixed selection colors breaking with more than 255 selections
- Fixed pasted URLs with a panorama not loading by pano ID
- Fixed deleting many tags at once being slow
- Fixed generator region count inputs clipping long values
- Fixed the shortcut filter box scrolling away in the settings list
- Fixed the map list stretching awkwardly on long names

## v0.5.3 — 2026-06-09

- Customizable active marker color
- Map follows along while reviewing locations
- Adjustable marker opacity, merged into the Street View opacity slider
- Fixed single-coordinate paste (+ more supported formats)
- Large imports now commit automatically, with a warning first
- Date picker now shows local time instead of UTC
- Importing GeoJSON now creates one selection instead of one per polygon part
- Vali plugin now matches the app theme
- Faster selections on large maps
- Faster large imports
- Fixed imported locations not appearing for users with non-Latin characters in their username
- Fixed a stray blue highlight and focus ring on the Street View panorama
- Fixed picking a location with the keyboard

## v0.5.2 — 2026-06-06

- Overhauled review system with review sessions, select reviewed/unreviewed, and review bar
- Pick N random locations from the current selection
- Drag-and-drop file import
- Delete key removes selected locations from the overview
- Bulk "Set heading" operation
- Bulk Set field now supports camera fields (heading, pitch, zoom)
- Apply metadata field as tags
- Save selection as tag moved to per-selection context menu
- Native save dialog for export
- Export notification on completion
- Preview aspect ratio presets (16:9, 21:9, etc.)
- Heatmap plugin remembers settings between sessions
- Offline country distribution
- Faster startup via lazy-loaded deck.gl
- More flexible editor split on small screens
- Fixed polygon selections across the antimeridian
- Fixed generator not stopping in-flight Street View requests on pause
- Fixed editor occasionally racing map open on slow loads
- Fixed country distribution accuracy with border point-in-polygon

## v0.5.1 — 2026-06-03

- New weather plugin
- New selection disambiguation plugin that ranks metadata fields by how much they differ between groups
- Merge duplicate locations command
- Score bounds editor settings
- Import staging sidebar with an on-map preview of locations before importing
- Full-resolution panorama download fix
- GeoGuessr-style map scale in fullscreen
- Bulk metadata field management: rename, merge, delete, and set values
- Ghost selections command - ephemeralize selections
- "Edit filter" - inline dropdowns for individual filters
- Rebindable quick-tag hotkeys
- Tag tree multi-select and drag-to-reorder fixes
- Save a selection as a tag, or delete a selection's locations; as commands
- Pano uploader name as new enrichment field
- Commit diff overlay in version history upon clicking a commit
- Configurable heatmap color gradient with presets, scopeable to the active selection
- Gradient coloring now sorts values naturally and maps colors proportionally
- Numeric bucketing in pivot tables
- "Center toward nearest road" hotkey
- Quick-copy the full Street View URL
- Clear button in the map list search field
- Press Enter in the map list to open the first match or create a new map
- Resolve hotkey conflicts inline while recording a binding
- Added a user manual
- Faster selections and tag filtering on large maps
- Fixed hotkeys not firing while the Street View panorama was focused
- Fixed re-adding a location from the Seen list after it had been deleted
- Fixed validation incorrectly flagging tripod panoramas
- Fixed manual navigation buttons showing fallback text instead of being hidden
- Fixed enrichment fields from multiple providers overwriting each other
- Fixed stale date/timezone not clearing
- Fixed the update pill opening settings instead of updating in place
- Fixed overly aggressive Alt hotkey conflict detection

## v0.5.0 — 2026-05-29

**Plugins & marketplace**
- **Plugin marketplace** with two tabs — Core (bundled) and Additional (fetched from GitHub). Install/uninstall downloads or deletes plugin files in app data; enable/disable is separate, so you can deactivate a plugin without removing it. Manually-installed plugins show up too.
- **Shared modules** — plugins can now import app-bundled libraries (React, deck.gl, luma.gl) instead of bundling their own copies.
- New **heatmap** plugin
- New **gradient coloring** plugin — colors markers by any field. Numeric/date fields get range buckets, categorical fields get one color per value.
- New **pivot table analytics** plugin — cross-tabulates your selection (active, saved, or all) against any field or tags.
- New **sun position** plugin — computes sun azimuth and altitude for each location from its coordinates and capture time.

**Editor**
- **Multi-window editing** — open maps in separate windows.
- **Time-of-day filtering** in the date picker — date fields get an optional time input, and a new "Any date" mode lets you filter purely by time of day.
- **Country select improvements** faster, and offers downloadable higher-accuracy border datasets — High (~10MB) and Ultra (~46MB), selectable under Street View settings.
- **Fit bounds on paste** — optionally reframe the map to the locations you just pasted.
- **Minimum search radius** map setting (10–500m slider) controlling the floor for Street View lookups.
- **Driving-direction enrichment** — new metadata field for the capture-time driving direction.

**Performance**
- Much faster selections on large maps — selecting everything on a 1M-location map is now near-instant (~435ms → ~16ms).

**Fixes**
- Fixed the auto-updater 404 and missing macOS update signatures in the release workflow.
- Fixed road/link heading reading the wrong protobuf field
- Fixed several date picker bugs: bare month parsing, value conversion when toggling any-year/any-time, persistence across navigation, and a year grid (2007–now).
- Fixed a plugin activation race (plugins now wait for the map to be ready), gave the toolbar a deterministic order, fixed a marketplace double-click, and hardened plugin install against path traversal.
- Replaced native confirm() dialogs in Version History and the Seen dialog with inline click-to-confirm
- Fixed the fullscreen tag bar: visible input text color, spellcheck off, and an input-filtered palette.
- Narrowed the Alt keybinding block so it only catches genuine navigation conflicts instead of all Alt combos.
- Hid the scrollbar in the map overview.

## v0.4.0 — 2026-05-26

- Fixed same-name tags not merging
- Fixed autocomplete showing invisible tags
- Heading tape compass in the editor
- Custom date picker UI with year-agnostic filtering
- Zoom to selection bounds hotkey (Shift+E)
- Find and replace in tag names command
- Country select promoted from plugin to core feature
- Hover-to-expand tag palette in fullscreen mode
- Update-available indicator on startup
- Cancel in-flight POV tweens before starting new ones
- Fixed selection color flash when adding locations
- Fixed deleted locations remaining in review queue
- Fixed cross-type equality in selection filters
- Fixed hotkey binding UI accepting Alt and Ctrl+/- combos
- Fixed date picker layout instability
- Fixed radius override for forward/backward hotkeys
- Fixed main window not focusing when closing editor window

## v0.3.3 — 2026-05-24

- Bulk operation improvements: scope toggle (all vs. selected) + clear metadata fields
- Option for hierarchical tag tree -- tags with / in their name display as collapsible folders
- Enrichment field selection moved to a modal
- Auto-tag generated locations via per-map setting
- Shift-click range select for tags (replaces shift-drag)
- Tag color changes now update selection colors immediately
- Search bar in hotkey settings
- "Zoom reset" hotkey
- "Zoom to bounds" hotkey
- Selecting multiple tags at once is faster
- Fixed crash on first launch when app data directory doesn't exist

## v0.3.2 — 2026-05-23

- Memory-mapped Arrow IPC - large memory savings and minor performance wins
- Added same-location router UI
- Added "copy coordinates" from right-click context menu on the map
- Faster selection resolution
- *Slighty* faster active location switching
- Typed IPC bindings: every Rust command has auto-generated TypeScript types via specta (no manual invokes for the plugin API)
- Fixed tags not merging by name on import
- Date picker now correctly shows image date + nearby official dates in lat/lng fallback paths
- Fixed "Select Everything" resetting selections
- Fixed marker pickability
- opensv minified (smaller binary)
- Various bug fixes and internal refactors

## v0.3.1 — 2026-05-17

- **Saved selections system**: bookmark and reuse selections
- **Plugin API**
- Hotkey-command linking: all commands in the command palette now support hotkey settings
- Street View trail
- Shift+drag select tags
- Bulk delete tags
- Selections are now shared with the map and map generator plugin
- Various bug fixes

## v0.3.0 — 2026-05-15

## What's new
- **The entire data engine has been rewritten from scratch**. Maps with millions of locations now open, render, and respond to clicks without freezing.
- All marker styles (pin, arrow, circle) are now rendered on the GPU with custom shaders. Improves performance.
- Overhauled map list to be sortable and filterable. Includes labels and opening times, among other things.
- Location addresses are now by default resolved offline, with Nominatim as a legacy setting.
- Lock the Street View camera direction with a hotkey while navigating.
- Numerous bug fixes

**This is a breaking release. For this early version, updating requires backing up your existing data and deleting the app's user data folder to start from scratch.**

## v0.2.0 — 2026-05-09

Initial release.
