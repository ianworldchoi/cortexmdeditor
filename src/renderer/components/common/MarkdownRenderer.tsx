import { ExternalLink } from 'lucide-react'

interface MarkdownRendererProps {
    content: string
    onClick: (target: string) => void
    onHighlightHover?: (e: React.MouseEvent, text: string, comment: string) => void
    onHighlightLeave?: () => void
    onHighlightEdit?: (text: string, comment: string) => void
    onHighlightDelete?: (text: string) => void
}

export const MarkdownRenderer = ({
    content,
    onClick,
    onHighlightHover,
    onHighlightLeave,
    onHighlightEdit,
    onHighlightDelete
}: MarkdownRendererProps) => {
    if (!content) return <br />

    // Advanced parsing for:
    // 1. **Bold**
    // 2. *Italic*
    // 3. ~~Strikethrough~~
    // 4. `Code`
    // 5. [[Backlink]]
    // 6. ==Highlight== or ==Highlight==^[comment with [[backlinks]]]
    // 7. [text](url) - Hyperlinks

    // Tokenize content
    // Regex strategy: split by special sequences
    // Highlight pattern: ==text== or ==text==^[comment] (comment can contain [[backlinks]])
    // Hyperlink pattern: [text](url) - must not be [[backlink]]
    // Use a more greedy pattern for comments that allows nested brackets
    const regex = /(\[\[.*?\]\]|\*\*.*?\*\*|\*.*?\*|~~.*?~~|`.*?`|==.*?==(?:\^\[(?:[^\[\]]|\[\[.*?\]\])*\])?|(?<!\[)\[[^\[\]]*\]\([^)]+\))/g
    const parts = content.split(regex)

    return (
        <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            {parts.map((part, i) => {
                // Highlight with optional comment: ==text== or ==text==^[comment with [[backlinks]]]
                const highlightMatch = part.match(/^==(.*?)==(?:\^\[((?:[^\[\]]|\[\[.*?\]\])*)\])?$/)
                if (highlightMatch) {
                    const highlightedText = highlightMatch[1]
                    const comment = highlightMatch[2] || ''
                    return (
                        <span
                            key={i}
                            className="highlight"
                            onMouseEnter={(e) => onHighlightHover?.(e, highlightedText, comment)}
                            onMouseLeave={() => onHighlightLeave?.()}
                            data-comment={comment}
                        >
                            <MarkdownRenderer
                                content={highlightedText}
                                onClick={onClick}
                                onHighlightHover={onHighlightHover}
                                onHighlightLeave={onHighlightLeave}
                                onHighlightEdit={onHighlightEdit}
                                onHighlightDelete={onHighlightDelete}
                            />
                        </span>
                    )
                }

                // Backlink
                const linkMatch = part.match(/^\[\[(.+?)(?:\|(.+?))?\]\]$/)
                if (linkMatch) {
                    const target = linkMatch[1]
                    const alt = linkMatch[2] || target
                    return (
                        <span
                            key={i}
                            className="backlink"
                            onClick={(e) => {
                                e.stopPropagation()
                                onClick(target)
                            }}
                            title={`Link to ${target}`}
                        >
                            {alt}
                        </span>
                    )
                }

                // Bold
                const boldMatch = part.match(/^\*\*(.*?)\*\*$/)
                if (boldMatch) {
                    return <strong key={i}>{boldMatch[1]}</strong>
                }

                // Italic
                const italicMatch = part.match(/^\*(.*?)\*$/)
                if (italicMatch) {
                    return <em key={i}>{italicMatch[1]}</em>
                }

                // Strikethrough
                const strikeMatch = part.match(/^~~(.*?)~~$/)
                if (strikeMatch) {
                    return <s key={i}>{strikeMatch[1]}</s>
                }

                // Inline Code
                const codeMatch = part.match(/^`(.*?)`$/)
                if (codeMatch) {
                    return <code key={i} className="inline-code">{codeMatch[1]}</code>
                }

                // Hyperlink [text](url)
                const hyperlinkMatch = part.match(/^\[([^\[\]]*)\]\(([^)]+)\)$/)
                if (hyperlinkMatch) {
                    const linkText = hyperlinkMatch[1]
                    const url = hyperlinkMatch[2]
                    return (
                        <a
                            key={i}
                            href={url}
                            className="hyperlink"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MarkdownRenderer
                                content={linkText}
                                onClick={onClick}
                                onHighlightHover={onHighlightHover}
                                onHighlightLeave={onHighlightLeave}
                                onHighlightEdit={onHighlightEdit}
                                onHighlightDelete={onHighlightDelete}
                            />
                            <ExternalLink className="hyperlink-icon" />
                        </a>
                    )
                }

                return part
            })}
        </span>
    )
}
