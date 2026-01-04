import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useGraphStore, GraphNode, GraphLink } from '../../stores/graphStore'
import { useEditorStore } from '../../stores/editorStore'
import { useVaultStore } from '../../stores/vaultStore'
import { useThemeStore } from '../../stores/themeStore'
import { ExternalLink } from 'lucide-react'

export default function GraphView() {
    const containerRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const { nodes, links, refreshGraph, isLoading, settings, setGravityStrength, toggleShowTags, setGraphMode } = useGraphStore()
    const { openTab, appendBacklinkToFile } = useEditorStore()
    const { createNewFile } = useVaultStore()
    const { theme } = useThemeStore()

    // Interaction State
    const [isCmdPressed, setIsCmdPressed] = useState(false)
    const [showCreateModal, setShowCreateModal] = useState<{ sourceNode: GraphNode; x: number; y: number } | null>(null)

    // Refs for interaction state that doesn't need to trigger React re-renders unless necessary for Modal
    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity)
    const hoveredNodeRef = useRef<GraphNode | null>(null)
    const isSpacePressedRef = useRef(false)

    // Drag/Link State Refs
    const dragModeRef = useRef<'node' | 'link'>('node')
    const tempLinkRef = useRef<{ source: GraphNode; x: number; y: number } | null>(null)

    // Preview State
    const [previewNode, setPreviewNode] = useState<GraphNode | null>(null)
    const [previewContent, setPreviewContent] = useState<string>('')
    const [previewPos, setPreviewPos] = useState<{ x: number, y: number } | null>(null)
    const previewNodeIdRef = useRef<string | null>(null) // For D3 closure comparison
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Load content for preview
    useEffect(() => {
        if (!previewNode || !previewNode.path) {
            setPreviewContent('')
            return
        }

        const loadContent = async () => {
            setPreviewContent('Loading...')
            try {
                const content = await window.api.readFile(previewNode.path)
                setPreviewContent(content)
            } catch (e) {
                setPreviewContent('Failed to load content')
            }
        }
        loadContent()
    }, [previewNode])

    // Initialize graph data
    useEffect(() => {
        refreshGraph()
    }, [])

    // D3 Simulation Layout
    useEffect(() => {
        if (!canvasRef.current || !containerRef.current || nodes.length === 0) return

        const canvas = canvasRef.current
        const container = containerRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const isWolfram = settings.viewMode === 'wolfram'

        // Resize handling
        const resizeCanvas = () => {
            canvas.width = container.clientWidth
            canvas.height = container.clientHeight
        }
        resizeCanvas()
        window.addEventListener('resize', resizeCanvas)

        // Color scales & Visuals
        const isDark = theme === 'dark' || isWolfram // Wolfram mode forces dark

        let baseColor: string, highlightColor: string, linkColor: string, tagColor: string, tempLinkColor: string;

        if (isWolfram) {
            baseColor = '#ffffff' // White nodes
            highlightColor = '#06b6d4' // Cyan highlight
            linkColor = 'rgba(255, 255, 255, 0.3)' // Very faint white lines
            tagColor = '#06b6d4' // Cyan tags
            tempLinkColor = '#06b6d4'
        } else {
            baseColor = isDark ? '#4b5563' : '#9ca3af' // gray-600 : gray-400
            highlightColor = isDark ? '#e2e8f0' : '#1e293b' // slate-200 : slate-800
            linkColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
            tagColor = '#10b981' // emerald-500
            tempLinkColor = '#3b82f6' // blue-500
        }

        const colorScale = d3.scaleLinear<string>()
            .domain([1, 10]) // Mass range approximately
            .range([baseColor, highlightColor])
            .clamp(true)

        // Simulation setup
        const simulation = d3.forceSimulation<GraphNode>(nodes)

        // Configure Forces
        if (isWolfram) {
            simulation
                .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(30).strength(1)) // Max strength for stiffness
                .force('charge', d3.forceManyBody().strength(-100)) // Reduced repulsion (was -200)
                .force('center', d3.forceCenter(canvas.width / 2, canvas.height / 2).strength(0.1)) // Increased center pull (was 0.05)
                .force('radial', d3.forceRadial(Math.min(canvas.width, canvas.height) / 3, canvas.width / 2, canvas.height / 2).strength(0.05)) // Gentle containment
                .force('collide', d3.forceCollide().radius(5).iterations(2))
                .velocityDecay(0.3)
        } else {
            simulation
                .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id).distance(settings.showTags ? 80 : 50))
                .force('charge', d3.forceManyBody().strength(d => -30 * (d as GraphNode).mass))
                .force('center', d3.forceCenter(canvas.width / 2, canvas.height / 2).strength(settings.gravityStrength * 0.3)) // Use setting
                .force('radial', d3.forceRadial(Math.min(canvas.width, canvas.height) / 2.5, canvas.width / 2, canvas.height / 2).strength(0.04))
                .force('collide', d3.forceCollide().radius(d => (d as GraphNode).type === 'tag' ? 20 : (d as GraphNode).mass * 5 + 5).iterations(2))
                .velocityDecay(0.6)
        }


        // Custom Gravity Force (Only for Default Mode? Or modified for Wolfram?)
        const customGravity = (alpha: number) => {
            if (isWolfram) return; // Disable custom gravity for Wolfram mode to rely on pure physics

            nodes.forEach(node => {
                const connectedLinks = links.filter(l => (l.source as GraphNode).id === node.id || (l.target as GraphNode).id === node.id)
                connectedLinks.forEach(link => {
                    const neighbor = (link.source as GraphNode).id === node.id ? link.target as GraphNode : link.source as GraphNode
                    if (neighbor.mass > node.mass) {
                        const strength = (neighbor.mass - node.mass) * 0.05 * alpha * settings.gravityStrength
                        const dx = neighbor.x! - node.x!
                        const dy = neighbor.y! - node.y!
                        const distance = Math.sqrt(dx * dx + dy * dy)
                        if (distance > 0) {
                            node.vx! += (dx / distance) * strength
                            node.vy! += (dy / distance) * strength
                        }
                    }
                })
            })
        }

        simulation.on('tick', () => {
            customGravity(simulation.alpha())

            // Render Background
            if (isWolfram) {
                ctx.fillStyle = '#0a0a0a' // Deep black
                ctx.fillRect(0, 0, canvas.width, canvas.height)
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height)
            }

            ctx.save()

            // Apply zoom transform
            if (transformRef.current) {
                ctx.translate(transformRef.current.x, transformRef.current.y)
                ctx.scale(transformRef.current.k, transformRef.current.k)
            }

            // Draw links
            ctx.lineWidth = isWolfram ? 0.5 : 1
            links.forEach(link => {
                ctx.beginPath()
                ctx.strokeStyle = link.type === 'tag' ? (isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.2)') : linkColor
                // If Wolfram, force link color
                if (isWolfram) ctx.strokeStyle = linkColor

                const source = link.source as GraphNode
                const target = link.target as GraphNode
                ctx.moveTo(source.x!, source.y!)
                ctx.lineTo(target.x!, target.y!)
                ctx.stroke()
            })

            // Draw Temporary Link (while dragging with Cmd)
            if (tempLinkRef.current) {
                ctx.beginPath()
                ctx.strokeStyle = tempLinkColor
                ctx.lineWidth = 2
                ctx.setLineDash([5, 5])
                ctx.moveTo(tempLinkRef.current.source.x!, tempLinkRef.current.source.y!)
                ctx.lineTo(tempLinkRef.current.x, tempLinkRef.current.y)
                ctx.stroke()
                ctx.setLineDash([])
                ctx.lineWidth = 1 // Reset
            }

            // Draw nodes
            nodes.forEach(node => {
                ctx.beginPath()
                const isTag = node.type === 'tag'

                let radius = 0;
                if (isWolfram) {
                    radius = 3; // Uniform small radius
                } else {
                    radius = isTag ? Math.max(4, Math.sqrt(node.mass) * 3) : Math.max(3, Math.sqrt(node.mass) * 4)
                }

                ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI)

                if (isWolfram) {
                    ctx.fillStyle = isTag ? tagColor : baseColor
                } else {
                    if (isTag) {
                        ctx.fillStyle = tagColor
                    } else {
                        ctx.fillStyle = colorScale(node.mass)
                    }
                }

                // "Star" glow for high mass nodes
                if (!isWolfram && node.mass > 5 && !isTag) {
                    ctx.shadowBlur = 10
                    ctx.shadowColor = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'
                } else {
                    ctx.shadowBlur = 0
                }

                // Highlight source node during link creation
                if (tempLinkRef.current?.source === node) {
                    ctx.shadowBlur = 15
                    ctx.shadowColor = tempLinkColor
                }

                ctx.fill()
                ctx.shadowBlur = 0 // Reset

                // Draw Label
                // For Wolfram, show fewer labels to keep it clean
                const shouldShowLabel = isWolfram
                    ? (node === hoveredNodeRef.current) // Only on hover
                    : (node === hoveredNodeRef.current || node.mass > 3 || isTag || tempLinkRef.current?.source === node)

                if (shouldShowLabel) {
                    ctx.fillStyle = (isWolfram || isTag) ? tagColor : (isDark ? '#e2e8f0' : '#1e293b')
                    ctx.font = (node.mass > 5 || isTag) ? 'bold 12px Inter' : '10px Inter'
                    if (isWolfram) ctx.font = '10px monospace'

                    ctx.fillText(node.title, node.x! + radius + 4, node.y! + 4)
                }
            })

            ctx.restore()
        })


        // Interaction Logic
        const getSimulationCoords = (sourceEvent: any) => {
            const transform = transformRef.current || d3.zoomIdentity
            const [mx, my] = d3.pointer(sourceEvent, canvas)
            const x = transform.invertX(mx)
            const y = transform.invertY(my)
            return { x, y }
        }

        const findNodeAt = (x: number, y: number) => {
            let subject: GraphNode | null = null
            let minDist = 20 / (transformRef.current?.k || 1)

            for (const node of nodes) {
                const dx = x - node.x!
                const dy = y - node.y!
                const dist = Math.sqrt(dx * dx + dy * dy)
                if (dist < minDist) {
                    minDist = dist
                    subject = node
                }
            }
            return subject
        }

        const dragSubject = (event: any) => {
            const { x, y } = getSimulationCoords(event.sourceEvent)
            return findNodeAt(x, y)
        }

        const drag = d3.drag<HTMLCanvasElement, unknown>()
            .subject(dragSubject)
            .on('start', (event) => {
                // If Cmd is pressed, we enter 'link' mode, NOT 'node' drag mode
                if (isCmdPressed) {
                    dragModeRef.current = 'link'
                    tempLinkRef.current = { source: event.subject, x: event.subject.x!, y: event.subject.y! }
                    canvas.style.cursor = 'crosshair'
                    // Pin the node so it doesn't move while creating a link
                    event.subject.fx = event.subject.x
                    event.subject.fy = event.subject.y
                } else {
                    dragModeRef.current = 'node'
                    if (!event.active) simulation.alphaTarget(0.3).restart()
                    event.subject.fx = event.subject.x
                    event.subject.fy = event.subject.y
                    canvas.style.cursor = 'grabbing'
                }
            })
            .on('drag', (event) => {
                const { x, y } = getSimulationCoords(event.sourceEvent)

                if (dragModeRef.current === 'link') {
                    // Update temp link endpoint
                    if (tempLinkRef.current) {
                        tempLinkRef.current.x = x
                        tempLinkRef.current.y = y
                        // Force re-render via tick (alpha restart might be too aggressive, but ensures smoothness)
                        simulation.alpha(0.01).restart()
                    }
                } else {
                    event.subject.fx = x
                    event.subject.fy = y
                }
            })
            .on('end', (event) => {
                if (dragModeRef.current === 'link') {
                    // Check drop target
                    const { x, y } = getSimulationCoords(event.sourceEvent)
                    const targetNode = findNodeAt(x, y)

                    if (targetNode && targetNode !== event.subject) {
                        // Connect to existing node
                        // Create backlink in source file
                        if (event.subject.type === 'note' && event.subject.path) {
                            appendBacklinkToFile(event.subject.path, targetNode.title)
                        }
                    } else if (!targetNode) {
                        // Dropped in empty space
                        // Open Creation Modal
                        // We need screen coordinates for the modal
                        setShowCreateModal({
                            sourceNode: event.subject,
                            x: event.sourceEvent.clientX,
                            y: event.sourceEvent.clientY
                        })
                    }

                    tempLinkRef.current = null
                    canvas.style.cursor = 'default'

                    // Unpin the node
                    event.subject.fx = null
                    event.subject.fy = null

                    simulation.alpha(0.1).restart() // Clear the line

                } else {
                    if (!event.active) simulation.alphaTarget(0)
                    event.subject.fx = null
                    event.subject.fy = null
                    canvas.style.cursor = 'grab'
                }

                dragModeRef.current = 'node' // Reset
            })

        const zoom = d3.zoom<HTMLCanvasElement, unknown>()
            .scaleExtent([0.1, 4])
            .filter((event) => {
                if (event.type === 'mousedown') {
                    return isSpacePressedRef.current
                }
                return true
            })
            .on('zoom', (event) => {
                transformRef.current = event.transform
                if (simulation.alpha() < 0.1) simulation.alpha(0.1).restart()
            })

        drag.filter((event) => !isSpacePressedRef.current)

        d3.select(canvas).call(drag)
        d3.select(canvas).call(zoom).on('dblclick.zoom', null)

        // Keyboard listeners for Space bar
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Meta' || e.key === 'Control') {
                setIsCmdPressed(true)
            }
            if (e.code === 'Space' && !e.repeat) {
                isSpacePressedRef.current = true
                canvas.style.cursor = 'grab'
            }
        }
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Meta' || e.key === 'Control') {
                setIsCmdPressed(false)
            }
            if (e.code === 'Space') {
                isSpacePressedRef.current = false
                canvas.style.cursor = 'default'
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        // Click / Hover
        d3.select(canvas)
            .on('mousemove', (event) => {
                if (isSpacePressedRef.current || dragModeRef.current === 'link') return

                const { x, y } = getSimulationCoords(event)
                const found = findNodeAt(x, y)

                if (hoveredNodeRef.current !== found) {
                    hoveredNodeRef.current = found
                    if (simulation.alpha() < 0.05) simulation.alpha(0.05).restart()
                    canvas.style.cursor = found ? (isCmdPressed ? 'crosshair' : 'grab') : 'default'

                    // Hover Preview Logic
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)

                    if (found && found.type === 'note') {
                        // Start timer to open preview
                        hoverTimerRef.current = setTimeout(() => {
                            // Only open if we are NOT already showing this node
                            if (previewNodeIdRef.current !== found.id) {
                                setPreviewNode(found)
                                previewNodeIdRef.current = found.id
                                // Position relative to the container
                                const rect = containerRef.current?.getBoundingClientRect()
                                if (rect) {
                                    setPreviewPos({
                                        x: event.clientX - rect.left,
                                        y: event.clientY - rect.top
                                    })
                                }
                            }
                        }, 800) // 0.8s delay
                    } else if (!found) {
                        // Check if we should cancel pending
                        // If we left the node, we cancel the timer. 
                        // We DO NOT close the existing preview (per user req "Mouse out doesn't close")
                    }

                } else if (found && isCmdPressed) { // Update cursor if Cmd pressed while hovering
                    canvas.style.cursor = 'crosshair'
                }
            })
            .on('click', (event) => {
                if (event.defaultPrevented) return
                if (isSpacePressedRef.current) return

                const { x, y } = getSimulationCoords(event)
                const found = findNodeAt(x, y)

                if (!found) {
                    // Clicked Content (Background) -> Close Preview
                    if (previewNodeIdRef.current) {
                        setPreviewNode(null)
                        previewNodeIdRef.current = null
                    }
                }

                if (found && !isCmdPressed && dragModeRef.current !== 'link') { // Standard click open
                    openTab(found.path, found.title)
                }
            })

        return () => {
            simulation.stop()
            window.removeEventListener('resize', resizeCanvas)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [nodes, links, theme, settings, isCmdPressed]) // Re-run if graph data, theme, settings, or Cmd state change


    const handleCreateNode = async (name: string, folderPath: string, content: string, tags: string[]) => {
        if (!showCreateModal) return;

        // Create new file
        const newFilePath = await createNewFile(folderPath, name, content, tags)

        if (newFilePath) {
            // Create backlink
            const fileName = name.endsWith('.md') ? name.replace('.md', '') : name
            const sourcePath = showCreateModal.sourceNode.path
            if (sourcePath) {
                await appendBacklinkToFile(sourcePath, fileName)
            }
        }

        setShowCreateModal(null)
    }

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: 'var(--color-bg-primary)' }}>
            {isLoading && (
                <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, color: 'var(--color-text-secondary)' }}>
                    Loading Graph...
                </div>
            )}
            <canvas ref={canvasRef} style={{ display: 'block' }} />

            <div style={{
                position: 'absolute',
                bottom: 20,
                right: 20,
                background: 'var(--color-bg-secondary)',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                fontSize: '12px',
                color: 'var(--color-text-secondary)'
            }}>
                {nodes.length} Nodes • {links.length} Links
            </div>

            {/* Graph Controls */}
            <div style={{
                position: 'absolute',
                top: 20,
                right: 20,
                width: 200,
                background: 'var(--color-bg-secondary)',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Physics & Display
                </div>

                {/* Gravity Slider */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                        <span>Gravity</span>
                        <span>{(settings.gravityStrength * 10).toFixed(0)}</span>
                    </div>
                    <input
                        type="range"
                        min="0.1"
                        max="2.0"
                        step="0.1"
                        value={settings.gravityStrength}
                        onChange={(e) => setGravityStrength(parseFloat(e.target.value))}
                        style={{ width: '100%', cursor: 'pointer' }}
                    />
                </div>

                {/* Show Tags Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>Show Tag Links</span>
                    <label className="toggle-switch" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={settings.showTags}
                            onChange={() => toggleShowTags()}
                            style={{ marginRight: '6px' }}
                        />
                    </label>
                </div>

                {/* View Mode Toggle */}
                <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0', paddingTop: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6 }}>
                        Graph Style
                    </div>
                    <div style={{ display: 'flex', background: 'var(--color-bg-tertiary)', borderRadius: 6, padding: 2 }}>
                        <button
                            onClick={() => setGraphMode('default')}
                            style={{
                                flex: 1,
                                border: 'none',
                                background: settings.viewMode === 'default' ? 'var(--color-bg-primary)' : 'transparent',
                                color: settings.viewMode === 'default' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                                fontSize: 10,
                                padding: '4px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                boxShadow: settings.viewMode === 'default' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            Default
                        </button>
                        <button
                            onClick={() => setGraphMode('wolfram')}
                            style={{
                                flex: 1,
                                border: 'none',
                                background: settings.viewMode === 'wolfram' ? 'var(--color-bg-primary)' : 'transparent',
                                color: settings.viewMode === 'wolfram' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                                fontSize: 10,
                                padding: '4px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                boxShadow: settings.viewMode === 'wolfram' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            Wolfram
                        </button>
                    </div>
                </div>

                <div style={{ marginTop: 8, fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    ✨ Hold <b>Cmd</b> and drag from a node to connect!
                </div>
            </div>

            {showCreateModal && (
                <GraphNodeCreationModal
                    x={showCreateModal.x}
                    y={showCreateModal.y}
                    defaultPath={showCreateModal.sourceNode.path ? showCreateModal.sourceNode.path.substring(0, showCreateModal.sourceNode.path.lastIndexOf('/')) : undefined}
                    onConfirm={handleCreateNode}
                    onCancel={() => setShowCreateModal(null)}
                />
            )}

            {previewNode && previewPos && (
                <GraphNodePreviewModal
                    node={previewNode}
                    content={previewContent}
                    x={previewPos.x}
                    y={previewPos.y}
                    onOpen={() => openTab(previewNode.path, previewNode.title)}
                />
            )}
        </div>
    )
}

function GraphNodePreviewModal({ node, content, x, y, onOpen }: { node: GraphNode, content: string, x: number, y: number, onOpen: () => void }) {
    // Trim content for preview
    const simpleContent = content.length > 500 ? content.substring(0, 500) + '...' : content

    return (
        <div style={{
            position: 'absolute',
            top: y + -20,
            left: x + -20,
            width: '280px',
            maxHeight: '300px',
            background: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            boxShadow: '0 8px 16px rgba(0,0,0,0.2)',
            zIndex: 900,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {node.title}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); onOpen(); }}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        color: 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center'
                    }}
                    title="Open Document"
                >
                    <ExternalLink size={14} />
                </button>
            </div>

            {/* Content */}
            <div style={{
                padding: '12px 16px',
                overflowY: 'auto',
                fontSize: '12px',
                lineHeight: '1.5',
                color: 'var(--color-text-secondary)',
                whiteSpace: 'pre-wrap',
                fontFamily: 'var(--font-mono)'
            }}>
                {simpleContent}
            </div>
        </div>
    )
}

// Internal Modal Component
function GraphNodeCreationModal({ x, y, defaultPath, onConfirm, onCancel }: { x: number, y: number, defaultPath?: string, onConfirm: (name: string, folderPath: string, content: string, tags: string[]) => void, onCancel: () => void }) {
    const { fileTree, vaultPath } = useVaultStore()
    const [name, setName] = useState('')
    const [tags, setTags] = useState('')
    const [content, setContent] = useState('')
    const [folderPath, setFolderPath] = useState(defaultPath || vaultPath || '')
    const inputRef = useRef<HTMLInputElement>(null)

    // Helper to get all folders
    const getFolders = (nodes: any[], folders: { name: string, path: string }[] = []) => {
        nodes.forEach(node => {
            if (node.isDirectory) {
                folders.push({ name: node.name, path: node.path })
                if (node.children) {
                    getFolders(node.children, folders)
                }
            }
        })
        return folders
    }
    const allFolders = [{ name: 'Root', path: vaultPath || '' }, ...getFolders(fileTree)]

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    return (
        <div style={{
            position: 'absolute',
            top: y,
            left: x,
            transform: 'translate(-50%, -100%)', // Above cursor
            background: 'var(--color-bg-primary)',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minWidth: '320px',
            zIndex: 1000
        }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>New Connected Note</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Title</label>
                <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Note Title..."
                    style={{
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        fontSize: '13px',
                        background: 'var(--color-bg-secondary)',
                        color: 'var(--color-text-primary)',
                        outline: 'none'
                    }}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Location</label>
                <select
                    value={folderPath}
                    onChange={e => setFolderPath(e.target.value)}
                    style={{
                        padding: '6px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        fontSize: '12px',
                        background: 'var(--color-bg-secondary)',
                        color: 'var(--color-text-primary)',
                        outline: 'none',
                        width: '100%'
                    }}
                >
                    {allFolders.map(folder => (
                        <option key={folder.path} value={folder.path}>
                            {folder.path === vaultPath ? '/ (Root)' : folder.path.replace(vaultPath + '/', '')}
                        </option>
                    ))}
                </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Tags</label>
                <input
                    type="text"
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                    placeholder="tag1, tag2 (comma separated)"
                    style={{
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        fontSize: '13px',
                        background: 'var(--color-bg-secondary)',
                        color: 'var(--color-text-primary)',
                        outline: 'none'
                    }}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Content (Mini Editor)</label>
                <textarea
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Write your note here..."
                    style={{
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        fontSize: '13px',
                        fontFamily: 'monospace',
                        background: 'var(--color-bg-secondary)',
                        color: 'var(--color-text-primary)',
                        outline: 'none',
                        minHeight: '100px',
                        resize: 'vertical'
                    }}
                    onKeyDown={e => {
                        // Allow basic shortcuts if needed, but Enter should probably new line in textarea
                        // Cmd+Enter to submit
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                            if (name.trim()) {
                                const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean)
                                onConfirm(name, folderPath, content, parsedTags)
                            }
                        }
                        if (e.key === 'Escape') onCancel()
                    }}
                />
                <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', textAlign: 'right' }}>
                    Cmd + Enter to save
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                    onClick={onCancel}
                    style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                        background: 'transparent',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer'
                    }}
                >
                    Cancel
                </button>
                <button
                    onClick={() => {
                        if (name.trim()) {
                            const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean)
                            onConfirm(name, folderPath, content, parsedTags)
                        }
                    }}
                    style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'var(--color-accent)',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 500
                    }}
                >
                    Create Note
                </button>
            </div>
        </div>
    )
}
