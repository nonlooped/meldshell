# Transcript rendering

Use this reference for Markdown, links, file chips, code, diagrams, math, and images. [Markdown.tsx](../apps/desktop/src/renderer/src/ui/Markdown.tsx) owns shared rendering. Stored provider text and payloads remain unchanged.

## Links and file references

Web links display the destination page title fetched by main with bounded requests and a shared cache. If fetching fails, keep a supplied descriptive label; bare links fall back to "Web page". URLs and domains are not added beside links or to their tooltips. Title fetching executes no page scripts and sends no browser cookies.

File links and recognizable inline paths use file-type chips. Destinations with `:12`, `:12:4`, or `#L12-L18` retain line references and open the file viewer there. Markdown/HTML line references open source; clearing the reference restores the normal preview.

Skill links and submitted skill attachments use skill chips with hover/focus excerpts. Reads retain the workspace boundary. An outside-workspace reference can be displayed but cannot be read through that viewer.

## Rich content

| Content | Behavior |
| --- | --- |
| Code fences | Highlighting, line numbers, copying, and folding; metadata such as `tsx filename="src/App.tsx" start=12` supplies source context |
| Diff/patch fences | Shared diff renderer; incomplete streamed diffs stay as text |
| Mermaid | Render after turn completion with lazy-loaded strict mode; show SVG as an image, or source and a notice on failure |
| Math | Inline dollar delimiters and double-dollar blocks use KaTeX with bundled fonts |
| Tables | CSV/TSV copy, sticky headers, and an expanded dialog |
| Long code and quotes | Expansion controls |
| Markdown/tool images | Zoom and navigation within the message or tool result |

Message copy remains available along with code/table copy controls. There is no message-wide find/sections toolbar. These rendering features do not add PDF support or expand the file viewer's format coverage.

## Verification

The existing `apps/desktop/src/renderer/src/ui/markdown-model.test.mjs` covers parsing, code preservation, search transforms, source metadata, and table serialization. Choose checks under [AGENTS.md](../AGENTS.md#verification); typechecks or builds are warranted only for relevant integration risks.

For requested manual coverage, use an actual transcript to check the affected feature: file-line navigation, focused previews, folded code, table copy, image zoom, completed diagrams, or math. Static checks do not certify those interactions.
