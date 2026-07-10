import { memo, useState, useRef, Children, isValidElement, type ReactNode, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'

interface MarkdownRendererProps {
  content: string
}

/** 从 React 子节点中提取纯文本（用于复制） */
function extractText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode }
    return extractText(props.children)
  }
  return ''
}

/** 代码块包装器：带语言标签与复制按钮 */
function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  // 从子级 <code> 元素中解析语言
  const codeElement = Children.toArray(children)[0]
  const codeClassName = isValidElement(codeElement)
    ? ((codeElement.props as { className?: string }).className ?? '')
    : ''
  const match = /language-(\w+)/.exec(codeClassName)
  const language = match ? match[1] : (codeClassName.includes('hljs') ? 'code' : 'text')

  const handleCopy = () => {
    const text = preRef.current?.textContent ?? extractText(children)
    if (!text) return
    try {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
    } catch {
      // 剪贴板不可用时静默失败
    }
  }

  return (
    <div className="my-3 overflow-hidden rounded-md border border-border-default bg-bg-tertiary shadow-inset">
      <div className="flex items-center justify-between border-b border-border-default bg-bg-tertiary px-3 py-1">
        <span className="text-xs text-text-secondary">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded text-xs text-text-secondary transition-smooth-fast hover:bg-white/10 hover:text-text-primary active:scale-90"
          type="button"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-accent-green" />
              <span className="text-accent-green">已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre ref={preRef} className="overflow-x-auto bg-bg-primary p-3 text-xs leading-relaxed">
        {children}
      </pre>
    </div>
  )
}

/** 代码组件：区分行内与块级 */
function CodeComponent({ className, children, ...rest }: ComponentPropsWithoutRef<'code'>) {
  // 经过 rehype-highlight 后，块级代码会带 hljs 或 language-xxx 类名
  const isBlock = !!className && (className.includes('hljs') || className.includes('language-'))
  if (isBlock) {
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    )
  }
  return (
    <code
      className="rounded bg-white/[0.08] px-1.5 py-0.5 font-mono text-xs text-accent-orange"
      {...rest}
    >
      {children}
    </code>
  )
}

/** 表格包装器：水平滚动 */
function TableWrapper({ children }: { children?: ReactNode }) {
  return (
    <div className="my-3 overflow-x-auto rounded-md border border-border-default">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  )
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body text-sm text-text-primary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          code: CodeComponent,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children, ...rest }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-link underline underline-offset-2 transition-opacity duration-200 hover:opacity-80"
              {...rest}
            >
              {children}
            </a>
          ),
          table: TableWrapper,
          thead: ({ children }) => (
            <thead className="bg-bg-tertiary">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-border-default px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-border-default px-2 py-1 align-top">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border-strong pl-3 text-text-secondary">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-lg font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-bold">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1 mt-2 text-sm font-semibold">{children}</h4>,
          p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
          hr: () => <hr className="my-3 border-border-default" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
