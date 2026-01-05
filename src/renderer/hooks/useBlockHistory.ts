import { useCallback, useRef } from 'react'
import type { Block } from '@shared/types'

interface UseBlockHistoryOptions {
    maxHistory?: number
}

interface UseBlockHistoryReturn {
    pushState: (blocks: Block[]) => void
    undo: () => Block[] | null
    redo: () => Block[] | null
    canUndo: () => boolean
    canRedo: () => boolean
    clear: () => void
}

/**
 * Custom hook for managing block-level undo/redo history.
 * Uses refs to avoid re-renders on stack changes.
 */
export function useBlockHistory(options: UseBlockHistoryOptions = {}): UseBlockHistoryReturn {
    const { maxHistory = 50 } = options

    const undoStack = useRef<Block[][]>([])
    const redoStack = useRef<Block[][]>([])

    // Deep clone blocks to ensure immutability
    const cloneBlocks = useCallback((blocks: Block[]): Block[] => {
        return JSON.parse(JSON.stringify(blocks))
    }, [])

    const pushState = useCallback((blocks: Block[]) => {
        const cloned = cloneBlocks(blocks)
        undoStack.current.push(cloned)

        // Limit stack size
        if (undoStack.current.length > maxHistory) {
            undoStack.current.shift()
        }

        // Clear redo stack when new action is performed
        redoStack.current = []
    }, [cloneBlocks, maxHistory])

    const undo = useCallback((): Block[] | null => {
        if (undoStack.current.length === 0) {
            return null
        }

        const prevState = undoStack.current.pop()!
        // Note: Current state should be pushed to redo by the caller
        return cloneBlocks(prevState)
    }, [cloneBlocks])

    const redo = useCallback((): Block[] | null => {
        if (redoStack.current.length === 0) {
            return null
        }

        const nextState = redoStack.current.pop()!
        return cloneBlocks(nextState)
    }, [cloneBlocks])

    const pushToRedo = useCallback((blocks: Block[]) => {
        redoStack.current.push(cloneBlocks(blocks))
    }, [cloneBlocks])

    const canUndo = useCallback(() => undoStack.current.length > 0, [])
    const canRedo = useCallback(() => redoStack.current.length > 0, [])

    const clear = useCallback(() => {
        undoStack.current = []
        redoStack.current = []
    }, [])

    return {
        pushState,
        undo,
        redo,
        canUndo,
        canRedo,
        clear,
        // Expose pushToRedo for proper undo/redo flow
        pushToRedo
    } as UseBlockHistoryReturn & { pushToRedo: (blocks: Block[]) => void }
}
