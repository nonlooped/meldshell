import assert from "node:assert/strict"
import { test } from "node:test"
import {
  fileReference,
  inlineFileReference,
  tableDelimited,
  enrichMarkdown,
  sourceTitles,
  webLinkLabel,
} from "./markdown-model.ts"

test("Windows and POSIX destinations preserve paths and line ranges", () => {
  assert.deepEqual(fileReference("C:/Work/My%20App/src/main.ts#L12-L18"), {
    path: "C:/Work/My App/src/main.ts",
    line: 12,
    endLine: 18,
    skill: false,
  })
  assert.equal(fileReference("file:///C:/Work/main.ts:12:4").path, "C:/Work/main.ts")
  assert.equal(fileReference("file:///home/work/main.ts").path, "/home/work/main.ts")
  assert.equal(fileReference("/C:/Work/main.ts").path, "C:/Work/main.ts")
  assert.equal(fileReference("skills/review/SKILL.md").skill, true)
  for (const invalid of [
    "javascript:alert(1)",
    "//host/file.ts",
    "https://example.com/a.ts",
    "a.ts#L0",
    "a.ts#L12-L1",
    "%ZZ",
    "#heading",
  ])
    assert.equal(fileReference(invalid), null, invalid)
})

test("inline values and package names are not mistaken for files", () => {
  for (const value of [
    "1.0.0",
    "true",
    "user.name",
    "foo/bar",
    "@base-ui-components/react",
    "npm run src/main.ts",
  ])
    assert.equal(inlineFileReference(value), null, value)
  for (const value of ["src/main.ts", "styles.css", ".env", "src/main.ts:12"])
    assert.ok(inlineFileReference(value), value)
})

test("CSV and TSV preserve cell delimiters, quotes and newlines", () => {
  const rows = [
    ["Name", "Value"],
    ["A, B", 'A "quote"\nand line'],
  ]
  assert.equal(tableDelimited(rows, ","), 'Name,Value\n"A, B","A ""quote""\nand line"')
  assert.equal(tableDelimited([["a\tb", "c"]], "\t"), '"a\tb"\tc')
})

test("search highlights literal matches inside code and assigns distinct heading anchors", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "h2",
        properties: {},
        children: [{ type: "text", value: "A [test]" }],
      },
      {
        type: "element",
        tagName: "h2",
        properties: {},
        children: [{ type: "text", value: "A [test]" }],
      },
      {
        type: "element",
        tagName: "pre",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "code",
            properties: {},
            children: [{ type: "text", value: "[test]" }],
          },
        ],
      },
    ],
  }
  enrichMarkdown({ prefix: "message", query: "[test]" })(tree)
  assert.notEqual(tree.children[0].properties.id, tree.children[1].properties.id)
  const code = tree.children[2].children[0]
  assert.equal(code.properties.dataBlock, true)
  assert.equal(code.children[1].tagName, "mark")
  assert.equal(code.children[1].children[0].value, "[test]")
})

test("source titles come only from explicit URL/title metadata", () => {
  const titles = sourceTitles([
    {
      item: {
        results: [
          { url: "https://example.com", title: "Example guide" },
          { url: "javascript:alert(1)", title: "Invalid" },
        ],
      },
    },
  ])
  assert.equal(titles.get("https://example.com"), "Example guide")
  assert.equal(titles.size, 1)
})

test("page title overrides the agent label and raw URL fallbacks stay hidden", () => {
  assert.equal(
    webLinkLabel(
      "Models | ChatGPT Learn",
      "Official OpenAI documentation",
      "official chatgpt documentation",
    ),
    "Models | ChatGPT Learn",
  )
  assert.equal(webLinkLabel(null, undefined, "Official documentation"), "Official documentation")
  for (const label of [
    "https://learn.chatgpt.com/docs/models",
    "learn.chatgpt.com",
    "www.example.com/page",
    "",
  ])
    assert.equal(webLinkLabel(null, undefined, label), "Web page")
})
