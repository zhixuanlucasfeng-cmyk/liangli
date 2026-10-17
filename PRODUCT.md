# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
Powy is the existing personal workspace for tasks, energy planning, ideas, goals, focus sessions, nutrition, budgets, journals and flashcards.

## Operating Context
Requested by its owner for laptop, desktop and iPad use; package the same application for macOS and Windows, with downloads on GitHub.

## Capabilities and Constraints
Preserve existing local storage, optional account sync, flashcards and nutrition/wallet JSON import/export. Nutrition and wallet remain device-local. Desktop storage is separate from browser storage. Existing working files outside this branch must remain untouched.

## Brand Commitments
User requests a clean interface, no Chainsaw Man, Power characters or manga decoration. Keep the Powy application name, not the character branding. Replace bottom navigation with a left sidebar. Main workflows fit the viewport; long lists use pagination, not a scrolling page.

## Open decisions
No signing certificates supplied. Initial desktop downloads will be explicitly marked unsigned preview builds. Electron is the implementer's choice to reuse the working application.
