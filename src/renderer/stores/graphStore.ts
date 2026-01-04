import { create } from 'zustand'
import { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force'

// Extension of d3 types for our graph
export interface GraphNode extends SimulationNodeDatum {
    id: string
    path: string
    title: string
    mass: number
    degree: number
    clustering: number // Local clustering coefficient
    tags: string[]
    type: 'note' | 'tag' // Distinguished type
    // Physics state handled by d3 (x, y, vx, vy, etc.)
}

export interface GraphLink extends SimulationLinkDatum<GraphNode> {
    source: string | GraphNode
    target: string | GraphNode
    type?: 'link' | 'tag' // Connection type
}

interface ParsedDoc {
    path: string
    title: string
    tags: string[]
    links: string[] // Target IDs (paths or names)
    linkContexts: Map<string, string> // Map of link target to the line containing it
}

interface GraphSettings {
    gravityStrength: number
    showTags: boolean
    viewMode: 'default' | 'wolfram'
}

interface GraphState {
    nodes: GraphNode[]
    links: GraphLink[]
    isLoading: boolean
    error: string | null

    // Internal Cache
    parsedDocs: Map<string, ParsedDoc>

    // Settings
    settings: GraphSettings

    // Actions
    refreshGraph: () => Promise<void> // Full re-scan
    setGravityStrength: (val: number) => void
    toggleShowTags: () => void
    setGraphMode: (mode: 'default' | 'wolfram') => void
    recalculateGraph: () => void // Re-build graph from cache
    getBacklinks: (noteId: string) => { path: string; title: string; context: string }[] // Get notes that link to this note
}

export const useGraphStore = create<GraphState>((set, get) => ({
    nodes: [],
    links: [],
    isLoading: false,
    error: null,
    parsedDocs: new Map(),
    settings: {
        gravityStrength: 0.7, // Default
        showTags: false,
        viewMode: 'default'
    },

    setGravityStrength: (val) => set(state => ({ settings: { ...state.settings, gravityStrength: val } })),

    toggleShowTags: () => {
        set(state => ({ settings: { ...state.settings, showTags: !state.settings.showTags } }))
        get().recalculateGraph()
    },

    setGraphMode: (mode) => set(state => ({ settings: { ...state.settings, viewMode: mode } })),

    getBacklinks: (noteId: string) => {
        const { parsedDocs } = get()
        const backlinks: { path: string; title: string; context: string }[] = []
        const seen = new Set<string>()

        // Extract the note's title and filename for matching
        const currentDoc = parsedDocs.get(noteId)
        const currentTitle = currentDoc?.title || ''
        const currentFileName = noteId.split('/').pop()?.replace('.md', '') || ''

        // Iterate through all parsed docs to find those that link to this note
        parsedDocs.forEach((doc, docPath) => {
            // Skip the note itself
            if (docPath === noteId) return

            // Check if any of the doc's links point to our note
            const matchingLink = doc.links.find(linkTarget => {
                return linkTarget === currentTitle || linkTarget === currentFileName
            })

            if (matchingLink && !seen.has(docPath)) {
                seen.add(docPath)
                // Get the context (line containing the link)
                const context = doc.linkContexts.get(matchingLink) || `[[${matchingLink}]]`
                backlinks.push({
                    path: docPath,
                    title: doc.title,
                    context
                })
            }
        })

        // Sort by path (alphabetically, which approximates recency for file systems)
        return backlinks.sort((a, b) => b.path.localeCompare(a.path))
    },

    recalculateGraph: () => {
        const { parsedDocs, settings, nodes: prevNodes } = get()
        if (parsedDocs.size === 0) return

        const nodesMap = new Map<string, GraphNode>()
        const links: GraphLink[] = []
        const outgoingLinks = new Map<string, Set<string>>() // For simple link tracking
        const nodeDegrees = new Map<string, number>()
        const incomingDegrees = new Map<string, number>() // Track incoming links separately

        // Helper to preserve physics
        const contentNode = (id: string, partial: Partial<GraphNode>): GraphNode => {
            const prev = prevNodes.find(n => n.id === id)
            return {
                ...partial,
                x: prev?.x,
                y: prev?.y,
                vx: prev?.vx,
                vy: prev?.vy
            } as GraphNode
        }

        // 1. Create Note Nodes
        parsedDocs.forEach(doc => {
            nodesMap.set(doc.path, contentNode(doc.path, {
                id: doc.path,
                path: doc.path,
                title: doc.title,
                mass: 1,
                degree: 0,
                clustering: 0,
                tags: doc.tags,
                type: 'note'
            }))
            nodeDegrees.set(doc.path, 0)
            incomingDegrees.set(doc.path, 0)
        })

        // 2. Create Tag Nodes (if enabled)
        if (settings.showTags) {
            parsedDocs.forEach(doc => {
                doc.tags.forEach(tag => {
                    const tagId = `tag:${tag}`
                    if (!nodesMap.has(tagId)) {
                        nodesMap.set(tagId, contentNode(tagId, {
                            id: tagId,
                            path: '', // No file path
                            title: `#${tag}`,
                            mass: 1,
                            degree: 0,
                            clustering: 0,
                            tags: [],
                            type: 'tag'
                        }))
                        nodeDegrees.set(tagId, 0)
                        incomingDegrees.set(tagId, 0)
                    }

                    // Link Note -> Tag
                    links.push({
                        source: doc.path,
                        target: tagId,
                        type: 'tag'
                    })
                    // Update degrees for mass
                    nodeDegrees.set(doc.path, (nodeDegrees.get(doc.path) || 0) + 1)
                    nodeDegrees.set(tagId, (nodeDegrees.get(tagId) || 0) + 1)
                    // Update incoming degree for target (tag)
                    incomingDegrees.set(tagId, (incomingDegrees.get(tagId) || 0) + 1)
                })
            })
        }

        // 3. Process Note Links
        // We need to resolve link targets to IDs
        parsedDocs.forEach(doc => {
            if (!outgoingLinks.has(doc.path)) outgoingLinks.set(doc.path, new Set())

            doc.links.forEach(linkTargetName => {
                // Find matching node
                let targetId: string | null = null

                // 1. Try exact path match (if we stored paths) -> unlikely from [[Name]]
                // 2. Name match
                for (const node of nodesMap.values()) {
                    if (node.type !== 'note') continue
                    const fileName = node.path.split('/').pop()?.replace('.md', '')
                    if (node.title === linkTargetName || fileName === linkTargetName) {
                        targetId = node.id
                        break
                    }
                }

                if (targetId && targetId !== doc.path) {
                    if (!outgoingLinks.get(doc.path)?.has(targetId)) {
                        links.push({
                            source: doc.path,
                            target: targetId,
                            type: 'link'
                        })
                        outgoingLinks.get(doc.path)?.add(targetId)

                        nodeDegrees.set(doc.path, (nodeDegrees.get(doc.path) || 0) + 1)
                        nodeDegrees.set(targetId, (nodeDegrees.get(targetId) || 0) + 1)
                        // Update incoming degree for target only
                        incomingDegrees.set(targetId, (incomingDegrees.get(targetId) || 0) + 1)
                    }
                }
            })
        })

        // 4. Calculate Clustering & Mass
        // Build neighbor sets for local clustering coefficient
        // We consider all links (note-note and note-tag) for graph topology
        const neighbors = new Map<string, Set<string>>()
        nodesMap.forEach((_, id) => neighbors.set(id, new Set()))

        links.forEach(link => {
            const s = typeof link.source === 'object' ? (link.source as GraphNode).id : link.source as string
            const t = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target as string
            neighbors.get(s)?.add(t)
            neighbors.get(t)?.add(s)
        })

        nodesMap.forEach((node, id) => {
            const degree = nodeDegrees.get(id) || 0
            const incomingDegree = incomingDegrees.get(id) || 0
            node.degree = degree

            // Clustering logic:
            // For tags, clustering might be weird (tags don't link to tags usually), but valid.
            if (degree < 2) {
                node.clustering = 0
            } else {
                const myNeighbors = Array.from(neighbors.get(id) || [])
                let connections = 0
                for (let i = 0; i < degree; i++) {
                    for (let j = i + 1; j < degree; j++) {
                        if (neighbors.get(myNeighbors[i])?.has(myNeighbors[j])) {
                            connections++
                        }
                    }
                }
                node.clustering = connections / ((degree * (degree - 1)) / 2)
            }

            // Mass Calculation - Based on incoming links only
            if (node.type === 'tag') {
                // Tag mass: based on how many notes use this tag
                node.mass = 2 + (incomingDegree * 0.5)
            } else {
                // Note mass: based on how many notes reference this note (backlinks)
                node.mass = 1 + (incomingDegree * 0.8) + (node.clustering * 3)
            }
        })

        set({
            nodes: Array.from(nodesMap.values()),
            links
        })
    },

    refreshGraph: async () => {
        try {
            set({ isLoading: true })
            const { vaultPath } = await import('./vaultStore').then(m => m.useVaultStore.getState())

            if (!vaultPath) {
                set({ isLoading: false, nodes: [], links: [] })
                return
            }

            const tree = await window.api.readVaultTree(vaultPath)

            function getAllMdPaths(nodes: any[]): string[] {
                let paths: string[] = []
                for (const node of nodes) {
                    if (!node.isDirectory && node.name.endsWith('.md')) {
                        paths.push(node.path)
                    } else if (node.children) {
                        paths = [...paths, ...getAllMdPaths(node.children)]
                    }
                }
                return paths
            }
            const paths = getAllMdPaths(tree)

            const fileContents = await Promise.all(paths.map(async (path) => {
                const content = await window.api.readFile(path)
                return { path, content }
            }))

            // Parse and cache
            const parsedDocs = new Map<string, ParsedDoc>()

            fileContents.forEach(({ path, content }) => {
                const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
                let title = path.split('/').pop()?.replace('.md', '') || 'Untitled'
                let tags: string[] = []

                if (frontmatterMatch) {
                    const fm = frontmatterMatch[1]
                    const titleMatch = fm.match(/title:\s*(.+)/)
                    if (titleMatch) title = titleMatch[1].trim()

                    const tagsMatch = fm.match(/tags:\s*\[(.*?)\]/)
                    if (tagsMatch) {
                        tags = tagsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')).filter(Boolean)
                    }
                }

                const outLinks: string[] = []
                const linkContexts = new Map<string, string>()

                // Process each line to capture context
                const lines = content.split('\n')
                for (const line of lines) {
                    // First, extract highlight comments to avoid regex confusion
                    // Pattern: ==text==^[comment with possible [[links]] and |date]
                    const highlightPattern = /==.*?==\^\[((?:[^\[\]]|\[\[.*?\]\])*)\]/g
                    let highlightMatch

                    // Extract backlinks from highlight comments
                    while ((highlightMatch = highlightPattern.exec(line)) !== null) {
                        const comment = highlightMatch[1]
                        // Remove date suffix (|YYYY-MM-DD) if present
                        const commentWithoutDate = comment.replace(/\|\d{4}-\d{2}-\d{2}$/, '')

                        // Extract backlinks from comment
                        const linkRegex = /\[\[(.*?)(?:\|.*?)?\]\]/g
                        let linkMatch
                        while ((linkMatch = linkRegex.exec(commentWithoutDate)) !== null) {
                            const linkTarget = linkMatch[1].trim()
                            if (!outLinks.includes(linkTarget)) {
                                outLinks.push(linkTarget)
                            }
                            if (!linkContexts.has(linkTarget)) {
                                linkContexts.set(linkTarget, line.trim())
                            }
                        }
                    }

                    // Then, extract backlinks from the rest of the line (excluding highlight comments)
                    // Remove highlight patterns first to avoid duplicate/incorrect parsing
                    const lineWithoutHighlights = line.replace(/==.*?==\^\[(?:[^\[\]]|\[\[.*?\]\])*\]/g, '')
                    const linkRegex = /\[\[(.*?)(?:\|.*?)?\]\]/g
                    let match
                    while ((match = linkRegex.exec(lineWithoutHighlights)) !== null) {
                        const linkTarget = match[1].trim()
                        if (!outLinks.includes(linkTarget)) {
                            outLinks.push(linkTarget)
                        }
                        // Store the line as context for this link
                        if (!linkContexts.has(linkTarget)) {
                            linkContexts.set(linkTarget, line.trim())
                        }
                    }
                }

                parsedDocs.set(path, {
                    path,
                    title,
                    tags,
                    links: outLinks,
                    linkContexts
                })
            })

            set({ parsedDocs, isLoading: false })
            get().recalculateGraph()

        } catch (error) {
            console.error('Failed to build graph:', error)
            set({
                error: error instanceof Error ? error.message : 'Unknown error',
                isLoading: false
            })
        }
    }
}))
