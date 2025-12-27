import { useState, useRef, useEffect, useCallback } from 'react'
import { FileEdit } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import BlockEditor from './BlockEditor'
import BrowserTab from './BrowserTab'
import TabBar from '../TabBar/TabBar'

export default function EditorArea() {
    const { editorGroups, activeGroupId, setActiveGroup, setGroupWidth } = useEditorStore()

    const [isResizing, setIsResizing] = useState(false)
    const [resizingIndex, setResizingIndex] = useState<number | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const handleResizeStart = useCallback((e: React.MouseEvent, index: number) => {
        e.preventDefault()
        setIsResizing(true)
        setResizingIndex(index)
    }, [])

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing || resizingIndex === null || !containerRef.current) return

            const containerRect = containerRef.current.getBoundingClientRect()
            const containerWidth = containerRect.width
            const mouseX = e.clientX - containerRect.left

            // Calculate ratio based on mouse position
            const ratio = (mouseX / containerWidth) * 100

            // Clamp between min (20%) and max (80%)
            const clampedRatio = Math.max(20, Math.min(80, ratio))

            const leftGroup = editorGroups[resizingIndex]
            if (leftGroup) {
                setGroupWidth(leftGroup.id, clampedRatio)
            }
        }

        const handleMouseUp = () => {
            setIsResizing(false)
            setResizingIndex(null)
            document.body.style.cursor = 'default'
            document.body.style.userSelect = 'auto'
        }

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove)
            window.addEventListener('mouseup', handleMouseUp)
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
            document.body.style.cursor = 'default'
            document.body.style.userSelect = 'auto'
        }
    }, [isResizing, resizingIndex, editorGroups, setGroupWidth])

    if (!editorGroups || editorGroups.length === 0) {
        return null
    }

    return (
        <div
            ref={containerRef}
            className="editor-area-container"
            style={{ display: 'flex', flex: 1, height: '100%', position: 'relative' }}
        >
            {editorGroups.map((group, index) => {
                const activeTab = group.tabs.find(t => t.id === group.activeTabId)
                const isActiveGroup = group.id === activeGroupId
                const isLastGroup = index === editorGroups.length - 1

                // Calculate width: use ratio if multiple groups, otherwise flex: 1
                const widthStyle = editorGroups.length > 1
                    ? { width: `${group.widthRatio || (100 / editorGroups.length)}%`, flex: 'none' }
                    : { flex: 1 }

                return (
                    <div key={group.id} style={{ display: 'flex', ...widthStyle }}>
                        <div
                            className={`editor-group ${isActiveGroup ? 'active-group' : ''}`}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                minWidth: 0
                            }}
                            onClick={() => setActiveGroup(group.id)}
                        >
                            <TabBar groupId={group.id} />

                            <div className="editor-content" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                                {!activeTab ? (
                                    <div className="empty-state">
                                        <FileEdit size={48} strokeWidth={1} style={{ opacity: 0.5 }} />
                                        <span className="empty-state-text">
                                            Select a document to start editing
                                        </span>
                                    </div>
                                ) : activeTab.type === 'browser' ? (
                                    <BrowserTab
                                        tabId={activeTab.id}
                                        initialUrl={activeTab.url || 'https://www.google.com'}
                                        isResizing={isResizing}
                                    />
                                ) : activeTab.isLoading ? (
                                    <div className="loading">
                                        <div className="loading-spinner" />
                                    </div>
                                ) : !activeTab.document ? (
                                    <div className="empty-state">
                                        <span className="empty-state-text">Failed to load document</span>
                                    </div>
                                ) : (
                                    <div className="editor-container" style={{ height: '100%', overflowY: 'auto' }}>
                                        <BlockEditor document={activeTab.document} tabId={activeTab.id} />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Resize Handle - only between groups */}
                        {!isLastGroup && (
                            <div
                                className={`split-resize-handle ${isResizing && resizingIndex === index ? 'active' : ''}`}
                                onMouseDown={(e) => handleResizeStart(e, index)}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
