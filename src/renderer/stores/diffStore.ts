import { create } from 'zustand'
import type { PendingDiff, Block } from '@shared/types'

export interface FileDiffSummary {
    filePath: string
    fileName: string
    deletions: number // -X (blocks deleted or modified)
    additions: number // +Y (blocks added or modified)
    status: 'modified' | 'created' | 'deleted' | 'error'
    errorMessage?: string
}

interface DiffState {
    // Map: filePath -> array of pending diffs
    pendingDiffs: Map<string, PendingDiff[]>

    // Add a diff for a specific file
    addDiff: (filePath: string, diff: PendingDiff) => void

    // Add multiple diffs at once (for batch operations)
    addDiffs: (filePath: string, diffs: PendingDiff[]) => void

    // Accept a diff: apply the change and remove from pending
    acceptDiff: (filePath: string, diffId: string) => PendingDiff | null

    // Reject a diff: discard the change and remove from pending
    rejectDiff: (filePath: string, diffId: string) => void

    // Get all pending diffs for a file
    getDiffsForFile: (filePath: string) => PendingDiff[]

    // Get a specific diff by block ID (for update/delete diffs)
    getDiffForBlock: (filePath: string, blockId: string) => PendingDiff | undefined

    // Get all diffs for a block (one block can have multiple diffs)
    getDiffsForBlock: (filePath: string, blockId: string) => PendingDiff[]

    // Get insert diffs that should appear after a specific block
    getInsertDiffsAfterBlock: (filePath: string, afterBlockId: string) => PendingDiff[]

    // Get summary for a specific file (calculates -X +Y)
    getFileSummary: (filePath: string) => FileDiffSummary | null

    // Get summaries for all files with pending diffs
    getAllFileSummaries: () => FileDiffSummary[]

    // Clear all diffs for a file
    clearDiffsForFile: (filePath: string) => void

    // Clear all diffs (useful for cleanup)
    clearAllDiffs: () => void
}

export const useDiffStore = create<DiffState>((set, get) => ({
    pendingDiffs: new Map(),

    addDiff: (filePath, diff) => {
        set((state) => {
            const newMap = new Map(state.pendingDiffs)
            const existing = newMap.get(filePath) || []
            newMap.set(filePath, [...existing, diff])
            return { pendingDiffs: newMap }
        })
    },

    addDiffs: (filePath, diffs) => {
        set((state) => {
            const newMap = new Map(state.pendingDiffs)
            const existing = newMap.get(filePath) || []
            newMap.set(filePath, [...existing, ...diffs])
            return { pendingDiffs: newMap }
        })
    },

    acceptDiff: (filePath, diffId) => {
        const { pendingDiffs } = get()
        const fileDiffs = pendingDiffs.get(filePath) || []
        const diff = fileDiffs.find(d => d.id === diffId)

        if (!diff) return null

        // Remove from pending
        set((state) => {
            const newMap = new Map(state.pendingDiffs)
            const filtered = (newMap.get(filePath) || []).filter(d => d.id !== diffId)
            if (filtered.length > 0) {
                newMap.set(filePath, filtered)
            } else {
                newMap.delete(filePath)
            }
            return { pendingDiffs: newMap }
        })

        return diff
    },

    rejectDiff: (filePath, diffId) => {
        set((state) => {
            const newMap = new Map(state.pendingDiffs)
            const filtered = (newMap.get(filePath) || []).filter(d => d.id !== diffId)
            if (filtered.length > 0) {
                newMap.set(filePath, filtered)
            } else {
                newMap.delete(filePath)
            }
            return { pendingDiffs: newMap }
        })
    },

    getDiffsForFile: (filePath) => {
        return get().pendingDiffs.get(filePath) || []
    },

    getDiffForBlock: (filePath, blockId) => {
        const diffs = get().pendingDiffs.get(filePath) || []
        // For update/delete, find by blockId
        return diffs.find(d => d.blockId === blockId && d.type !== 'insert')
    },

    getDiffsForBlock: (filePath, blockId) => {
        const diffs = get().pendingDiffs.get(filePath) || []
        return diffs.filter(d => d.blockId === blockId)
    },

    getInsertDiffsAfterBlock: (filePath, afterBlockId) => {
        const diffs = get().pendingDiffs.get(filePath) || []
        // Insert diffs use blockId as "afterBlockId" (insert after this block)
        // Sort by insertIndex to maintain correct order
        return diffs
            .filter(d => d.type === 'insert' && d.blockId === afterBlockId)
            .sort((a, b) => (a.insertIndex ?? 0) - (b.insertIndex ?? 0))
    },

    clearDiffsForFile: (filePath) => {
        set((state) => {
            const newMap = new Map(state.pendingDiffs)
            newMap.delete(filePath)
            return { pendingDiffs: newMap }
        })
    },

    clearAllDiffs: () => {
        set({ pendingDiffs: new Map() })
    },

    getFileSummary: (filePath) => {
        const diffs = get().pendingDiffs.get(filePath)
        if (!diffs || diffs.length === 0) return null

        const fileName = filePath.split('/').pop() || filePath
        let deletions = 0
        let additions = 0

        for (const diff of diffs) {
            if (diff.type === 'delete') {
                deletions++
            } else if (diff.type === 'insert') {
                additions++
            } else if (diff.type === 'update') {
                // Update counts as both deletion and addition
                deletions++
                additions++
            }
        }

        return {
            filePath,
            fileName,
            deletions,
            additions,
            status: 'modified'
        }
    },

    getAllFileSummaries: () => {
        const { pendingDiffs } = get()
        const summaries: FileDiffSummary[] = []

        for (const filePath of pendingDiffs.keys()) {
            const summary = get().getFileSummary(filePath)
            if (summary) {
                summaries.push(summary)
            }
        }

        return summaries
    }
}))
