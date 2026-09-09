# Release notes — v1.1.0 (in progress)

A running list for the next release. One short entry per piece of work, in the
order it landed. When the release is cut, this is folded into `CHANGELOG.md`
under a dated heading and the file is emptied for the version after it.

**Version:** 1.1.0 — a backwards-compatible feature on top of 1.0.0, so the
minor number moves and the major stays put (semver).

## Added

- **Light theme.** The interface is no longer dark-only: Settings → Appearance
  offers Light, Dark, or Match system, which follows the OS appearance live and
  is the new default. The choice is remembered between launches.

## Changed

- **The palette is now a set of tokens.** Every colour in the interface comes
  from a named CSS variable (surfaces, text scale, accent, and the warn / danger
  / info tints) instead of a hex value spelled out in a component — the ~80
  hardcoded colours are gone. Swapping themes is a variable swap, and a new
  colour has one place to live.
- **The window opens in the right colour.** The main process stores the theme
  and paints the window background before the page loads, so a light-theme
  launch no longer flashes a dark rectangle. The native title bar and traffic
  lights follow the theme too.
- **The SQL editor follows the theme.** CodeMirror is reconfigured in place on a
  switch, so the document, the undo history and the cursor all survive it.
