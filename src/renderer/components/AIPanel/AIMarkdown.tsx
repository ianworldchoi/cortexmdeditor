import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface AIMarkdownProps {
    content: string
}

export default function AIMarkdown({ content }: AIMarkdownProps) {
    const components: Components = {
        // Custom code block rendering
        code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match && !className

            if (isInline) {
                return (
                    <code className="ai-md-inline-code" {...props}>
                        {children}
                    </code>
                )
            }

            return (
                <div className="ai-md-code-block">
                    <div className="ai-md-code-header">
                        <span className="ai-md-code-lang">{match?.[1] || 'code'}</span>
                        <button
                            className="ai-md-code-copy"
                            onClick={() => {
                                navigator.clipboard.writeText(String(children))
                            }}
                        >
                            Copy
                        </button>
                    </div>
                    <pre className="ai-md-code-content">
                        <code className={className} {...props}>
                            {children}
                        </code>
                    </pre>
                </div>
            )
        },
        // Custom link rendering
        a({ href, children }) {
            return (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ai-md-link"
                >
                    {children}
                </a>
            )
        },
        // Custom list rendering
        ul({ children }) {
            return <ul className="ai-md-ul">{children}</ul>
        },
        ol({ children }) {
            return <ol className="ai-md-ol">{children}</ol>
        },
        li({ children }) {
            return <li className="ai-md-li">{children}</li>
        },
        // Custom heading rendering
        h1({ children }) {
            return <h1 className="ai-md-h1">{children}</h1>
        },
        h2({ children }) {
            return <h2 className="ai-md-h2">{children}</h2>
        },
        h3({ children }) {
            return <h3 className="ai-md-h3">{children}</h3>
        },
        h4({ children }) {
            return <h4 className="ai-md-h4">{children}</h4>
        },
        // Paragraph
        p({ children }) {
            return <p className="ai-md-p">{children}</p>
        },
        // Blockquote
        blockquote({ children }) {
            return <blockquote className="ai-md-blockquote">{children}</blockquote>
        },
        // Table
        table({ children }) {
            return <table className="ai-md-table">{children}</table>
        },
        thead({ children }) {
            return <thead className="ai-md-thead">{children}</thead>
        },
        tbody({ children }) {
            return <tbody className="ai-md-tbody">{children}</tbody>
        },
        tr({ children }) {
            return <tr className="ai-md-tr">{children}</tr>
        },
        th({ children }) {
            return <th className="ai-md-th">{children}</th>
        },
        td({ children }) {
            return <td className="ai-md-td">{children}</td>
        },
        // Horizontal rule
        hr() {
            return <hr className="ai-md-hr" />
        },
        // Strong & emphasis
        strong({ children }) {
            return <strong className="ai-md-strong">{children}</strong>
        },
        em({ children }) {
            return <em className="ai-md-em">{children}</em>
        }
    }

    return (
        <div className="ai-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
            </ReactMarkdown>
        </div>
    )
}
