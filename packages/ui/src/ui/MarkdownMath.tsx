import ReactMarkdown, { type Options } from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"

export default function MarkdownMath({
  remarkPlugins = [],
  rehypePlugins = [],
  ...props
}: Options) {
  return (
    <ReactMarkdown
      {...props}
      remarkPlugins={[...(remarkPlugins ?? []), remarkMath]}
      rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore" }], ...(rehypePlugins ?? [])]}
    />
  )
}
