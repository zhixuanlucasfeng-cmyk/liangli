# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Product Purpose
Powvy Habit is the existing personal workspace for tasks, energy planning, ideas, goals, focus sessions, nutrition, budgets, journals and flashcards.

## Operating Context
Requested by its owner for laptop, desktop and iPad use; package the same application for macOS and Windows, with downloads on GitHub.

## Capabilities and Constraints
Preserve existing local storage, optional account sync, flashcards and nutrition/wallet JSON import/export. Nutrition and wallet remain device-local. Desktop storage is separate from browser storage. Existing working files outside this branch must remain untouched.

## Brand Commitments
The latest user direction supersedes the previous clean-white identity: Powvy Habit, with a sleeping cat inspired by Power from Chainsaw Man, stronger campus-manga ink frames, paper and screentones, plus a remembered night mode. Preserve left navigation and viewport-fitting pagination. User-facing branding changes; compatibility-sensitive data keys, app identity and local protocol remain stable.

## Open decisions
No signing certificates supplied. Initial desktop downloads will be explicitly marked unsigned preview builds. Electron is the implementer's choice to reuse the working application.
