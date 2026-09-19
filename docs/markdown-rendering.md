# Transcript rendering

Messages use the shared renderer in
[Markdown.tsx](../apps/desktop/src/renderer/src/ui/Markdown.tsx). The original
provider text and payloads remain unchanged.

- Web links use the destination HTML page title, fetched through main with bounded
  requests and a shared cache. The fetched title overrides the agent's label.
  If a page cannot be fetched, a supplied descriptive label is retained; bare
  links fall back to "Web page". URLs and domains are not displayed beside links
  or in link tooltips. Page scripts are not executed and browser cookies are
  not sent.
- File links and recognizable inline paths have file-type icons. `:12`,
  `:12:4`, and `#L12-L18` destinations carry line references. Activating a chip
  opens the existing file viewer at the referenced lines. Markdown and HTML
  line references open their source; clearing the reference restores the
  normal preview.
- `SKILL.md` links and submitted skill attachments have skill chips. Hovering
  or focusing a chip previews an excerpt from the current file. Reads retain
  the existing workspace boundary; references outside it can be displayed but
  cannot be read through the workspace viewer.
- Code fences have syntax highlighting, line numbers, copying, and folding.
  Optional fence metadata such as `tsx filename="src/App.tsx" start=12` supplies
  the header and starting line. Unified `diff`/`patch` fences reuse the diff
  renderer. Incomplete streamed diffs remain source text.
- `mermaid` fences render after the turn finishes. Invalid diagrams retain
  their source and show a rendering notice. The diagram engine loads on demand
  and renders in strict mode; the resulting SVG is displayed as an image.
- Inline `$...$` and block `$$...$$` math use KaTeX with bundled fonts.
- Tables have CSV/TSV copying, sticky headers, and a larger dialog view.
- Long code blocks and quotes can be expanded.
- The message-wide copy/find/sections toolbar is removed. Individual code and
  table copy controls remain, along with the existing message copy action.
  Markdown images and tool-result images support zoom and navigation within
  their message or tool result.

The file viewer's supported formats are unchanged; this does not add PDF or
other artifact formats.

## Verification

Run `node --test apps/desktop/src/renderer/src/ui/markdown-model.test.mjs` for
reference parsing, code preservation, search transforms, source metadata, and
table serialization regressions. Renderer typechecking and the desktop build
cover integration and bundled assets.

Manual verification should use an actual transcript: activate a file/line
chip, focus its preview, expand a folded code block, expand and copy a
table, and zoom an image. Check a completed Mermaid diagram and math expression
in both themes. These interactions are not certified by the static checks.
