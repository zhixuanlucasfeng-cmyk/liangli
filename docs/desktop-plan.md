# Powy clean desktop release

1. Preserve the current main branch's account/core implementation and carry forward local wallet categorization and insights.
2. Replace the manga stylesheet and companion UI with a light neutral workspace, restrained blue accent and left navigation. Split the life hub into direct Nutrition, Wallet and Journal navigation. Use contextual workspaces and paginated lists; keep long text accessible in a detail dialog. Smaller screens switch between editor and records.
3. Package the existing static application using Electron with sandboxing, isolation, no Node access in the renderer, a restricted local protocol, denied permissions and external navigation protection. Keep durable desktop data in Electron's user-data directory. Add import/export migration guidance.
4. Test existing business behavior and new navigation, pagination, desktop safety, layout and persistence. Verify laptop and iPad sizes plus compact-screen fallback.
5. Add reproducible GitHub Actions builds for Apple silicon, Intel Mac and Windows x64. Publish an unsigned preview release, checksums and installation notes. Do not claim notarization or signing.

## Direction contract
THESIS: One task at a time in a quiet personal workspace. No oversized hero or character decoration.

OWN-WORLD: Off-white canvas, white work panels, graphite text, blue selection, thin gray dividers, modest radii, system UI typography.

STORY: Select a tool in the left rail, enter or inspect data, see the result without navigating a long page.

FIRST VIEWPORT: 200px left navigation, 88px workspace header (76px on short windows), two-column working area. Today combines a compact load meter and editor on the left with a paginated task list on the right. Wallet uses overview, record, history, categories and cycle settings.

FORM: User-pinned clean sidebar workspace overrides concept seed d4768c32's broader alternatives. Code-led implementation to preserve the current operational UI and test behavior directly; no decorative raster artwork required.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
