import { useState, useRef, useEffect, useCallback } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import identityIconUrl from '../../assets/icons/identity.svg?url'
import BlockEditor from './BlockEditor'
import BrowserTab from './BrowserTab'
import GraphView from '../GraphView/GraphView'
import TabBar from '../TabBar/TabBar'

// Hook for scroll position tracking
function useScrollOverlay(containerRef: React.RefObject<HTMLDivElement | null>) {
    const [showTopOverlay, setShowTopOverlay] = useState(false)
    const [showBottomOverlay, setShowBottomOverlay] = useState(false)

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const checkScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container
            setShowTopOverlay(scrollTop > 20)
            setShowBottomOverlay(scrollTop + clientHeight < scrollHeight - 20)
        }

        // Initial check
        checkScroll()

        container.addEventListener('scroll', checkScroll)
        const resizeObserver = new ResizeObserver(checkScroll)
        resizeObserver.observe(container)

        return () => {
            container.removeEventListener('scroll', checkScroll)
            resizeObserver.disconnect()
        }
    }, [containerRef])

    const scrollToTop = useCallback(() => {
        containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }, [containerRef])

    return { showTopOverlay, showBottomOverlay, scrollToTop }
}

// Scrollable Editor Wrapper with overlay hints
interface ScrollableEditorProps {
    document: any
    tabId: string
    viewMode: 'edit' | 'preview'
    hasAnimated?: boolean
}

function ScrollableEditor({ document, tabId, viewMode, hasAnimated }: ScrollableEditorProps) {
    const editorContainerRef = useRef<HTMLDivElement>(null)
    const { showTopOverlay, showBottomOverlay, scrollToTop } = useScrollOverlay(editorContainerRef)
    const { vaultPath } = useVaultStore()
    const { addImageBlock, markTabAnimated } = useEditorStore()
    const [isDragOver, setIsDragOver] = useState(false)

    useEffect(() => {
        if (!hasAnimated) {
            // Short timeout to allow render, then mark as animated
            // Actually, we want the animation to play, so we keeping it false is fine until next time?
            // No, if we switch away and back, we want it to be true.
            // But if useStore updates, it might re-render?
            // "forwards" animation keeps state at end.
            // If we update store immediately, re-render might remove class?
            // We should mark it as animated AFTER checking/using it.
            // But if we update state, it triggers re-render.
            // Let's mark it as animated.
            markTabAnimated(tabId)
        }
    }, [tabId, hasAnimated, markTabAnimated])

    // If hasAnimated is false (first load), we add the class.
    // If hasAnimated is true (subsequent), we don't.
    // However, if we mark it true immediately in useEffect, it might re-render and remove class too fast?
    // The animation class should be present on mount.
    // If we change hasAnimated to true, and remove class, animation stops/resets?
    // We want the class to be there for the animation to run.
    // Actually, simple way: always add class if !hasAnimated.
    // But we need to make sure we don't re-render immediately with hasAnimated=true causing class removal.
    // React state updates are batched/fast.
    // Maybe we simple don't rely on store for the *current* render's class, but rely on prop passed.
    // The prop `hasAnimated` comes from store.
    // When we call `markTabAnimated(tabId)`, store updates, `ScrollableEditor` re-renders with `hasAnimated=true`.
    // Then class is removed.
    // So we need to DELAY marking it as animated? Or use local state?
    // If we use local state `animate`, initialized to `!hasAnimated`.
    // Then we update global store.

    // Better:
    // Pass `shouldAnimate = !hasAnimated`
    // If shouldAnimate, render with class.
    // useEffect(() => { if (shouldAnimate) markTabAnimated(tabId) }, [])
    // When store updates, `hasAnimated` becomes true. `shouldAnimate` becomes false. Component re-renders. Class removed.
    // If class removed, `transform` might reset to default (0).
    // `fileLoadReveal` ends at `transform: translateY(0)`.
    // Default is `transform: none` (which is 0).
    // So removing class *should* be fine visually after animation is done?
    // But if we remove it *during* animation (e.g. immediately), it will jump.
    // So we strictly need to mark it animated AFTER animation finishes (0.5s).

    const timeoutRef = useRef<NodeJS.Timeout>()
    useEffect(() => {
        if (!hasAnimated) {
            timeoutRef.current = setTimeout(() => {
                markTabAnimated(tabId)
            }, 600) // 0.5s animation + buffer
        }
        return () => clearTimeout(timeoutRef.current)
    }, [hasAnimated, tabId, markTabAnimated])

    const animationClass = !hasAnimated ? 'animate-file-load' : ''

    // Extract filename from document
    const fileName = document?.meta?.title || document?.filePath?.split('/').pop()?.replace(/\.md$/, '') || 'Untitled'

    // Image drop handlers
    const handleDragOver = useCallback((e: React.DragEvent) => {
        // Only accept image files
        if (e.dataTransfer.types.includes('Files')) {
            const items = Array.from(e.dataTransfer.items)
            const hasImage = items.some(item => item.type.startsWith('image/'))
            if (hasImage) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                setIsDragOver(true)
            }
        }
    }, [])

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        // Only reset if leaving the container (not entering a child)
        if (!editorContainerRef.current?.contains(e.relatedTarget as Node)) {
            setIsDragOver(false)
        }
    }, [])

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragOver(false)

        if (!vaultPath) {
            console.error('No vault path available')
            return
        }

        const files = Array.from(e.dataTransfer.files)
        const imageFiles = files.filter(file => file.type.startsWith('image/'))

        for (const file of imageFiles) {
            try {
                // Get the file path using webUtils via preload
                const filePath = window.api.getFilePath(file)
                if (!filePath) {
                    console.error('Cannot get file path from dropped file')
                    continue
                }

                // Copy image to vault attachments folder
                const relativePath = await window.api.copyImageToVault(filePath, vaultPath)

                // Add image block to document
                const fullPath = `${vaultPath}/${relativePath}`
                addImageBlock(tabId, fullPath)
            } catch (error) {
                console.error('Failed to copy image:', error)
            }
        }
    }, [vaultPath, tabId, addImageBlock])

    return (
        <div className="scrollable-editor-wrapper">
            {/* Top scroll overlay with filename */}
            <div
                className={`scroll-overlay scroll-overlay-top ${showTopOverlay ? 'visible' : ''}`}
                onClick={scrollToTop}
            >
                <span className="scroll-overlay-filename">{fileName}</span>
            </div>

            {/* Editor container */}
            <div
                ref={editorContainerRef}
                className={`editor-container ${animationClass} ${isDragOver ? 'drag-over' : ''}`}
                style={{ height: '100%', overflowY: 'auto' }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <BlockEditor
                    document={document}
                    tabId={tabId}
                    viewMode={viewMode}
                />
            </div>

            {/* Bottom scroll overlay */}
            <div className={`scroll-overlay scroll-overlay-bottom ${showBottomOverlay ? 'visible' : ''}`} />
        </div>
    )
}

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
            style={{ display: 'flex', flex: 1, height: '100%', position: 'relative', minWidth: 0, overflow: 'hidden' }}
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
                    <div key={group.id} style={{ display: 'flex', minWidth: 0, ...widthStyle }}>
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
                                        <img
                                            src={identityIconUrl}
                                            alt="Cortex"
                                            className="empty-state-logo"
                                        />
                                        <span className="empty-state-text">
                                            Select a document to start editing
                                        </span>
                                    </div>
                                ) : activeTab.type === 'graph' ? (
                                    <GraphView />
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
                                    <ScrollableEditor
                                        key={activeTab.id}
                                        document={activeTab.document}
                                        tabId={activeTab.id}
                                        viewMode={activeTab.viewMode || 'edit'}
                                        hasAnimated={activeTab.hasAnimated}
                                    />
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
