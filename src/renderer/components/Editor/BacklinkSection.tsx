import { useGraphStore } from '../../stores/graphStore'
import { useEditorStore } from '../../stores/editorStore'

interface BacklinkSectionProps {
    currentNoteId: string
}

// Render context with [[...]] parts highlighted
function ContextRenderer({ context }: { context: string }) {
    // Split by [[...]] pattern and render with highlights
    const regex = /(\[\[.*?\]\])/g
    const parts = context.split(regex)

    return (
        <span className="backlink-context">
            {parts.map((part, i) => {
                if (part.match(/^\[\[.*?\]\]$/)) {
                    // This is a [[...]] link - highlight it
                    return (
                        <span key={i} className="backlink-highlight">
                            {part}
                        </span>
                    )
                }
                return <span key={i}>{part}</span>
            })}
        </span>
    )
}

export default function BacklinkSection({ currentNoteId }: BacklinkSectionProps) {
    const { getBacklinks, parsedDocs } = useGraphStore()
    const { openTab } = useEditorStore()

    // Only render if we have parsed docs (graph has been initialized)
    if (parsedDocs.size === 0) {
        return null
    }

    const backlinks = getBacklinks(currentNoteId)

    const handleBacklinkClick = (path: string, title: string) => {
        openTab(path, title)
    }

    return (
        <div className="backlinks-section">
            <div className="backlinks-header">Backlinks</div>

            {backlinks.length === 0 ? (
                <div className="backlinks-empty">No backlinks</div>
            ) : (
                <ul className="backlinks-list">
                    {backlinks.map((backlink) => (
                        <li
                            key={backlink.path}
                            className="backlink-item"
                            onClick={() => handleBacklinkClick(backlink.path, backlink.title)}
                        >
                            <div className="backlink-source">{backlink.title}</div>
                            <ContextRenderer context={backlink.context} />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
