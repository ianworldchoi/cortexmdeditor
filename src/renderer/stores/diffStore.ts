import { create } from 'zustand'
import type { PendingDiff, Block } from '@shared/types'

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

    // Get a specific diff by block ID
    getDiffForBlock: (filePath: string, blockId: string) => PendingDiff | undefined

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
        return diffs.find(d => d.blockId === blockId)
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
    }
}))
