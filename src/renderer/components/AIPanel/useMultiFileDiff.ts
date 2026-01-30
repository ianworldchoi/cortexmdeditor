import { useCallback } from 'react'
import { useEditorStore, parseContentToBlocks } from '../../stores/editorStore'
import { useDiffStore } from '../../stores/diffStore'
import { useVaultStore } from '../../stores/vaultStore'
import type { PendingDiff } from '@shared/types'

interface AIAction {
    type: 'update' | 'insert' | 'delete'
    id?: string
    afterId?: string
    content?: string
    blockType?: string
}

/**
 * Custom hook for handling multi-file diff operations
 * Provides memoized callbacks to prevent infinite re-render loops
 */
export function useMultiFileDiff() {
    const { editorGroups, openTab } = useEditorStore()
    const { getDiffsForFile, clearDiffsForFile, getAllFileSummaries } = useDiffStore()
    const { vaultPath } = useVaultStore()

    // Open a file by clicking on its name
    const handleFileClick = useCallback(async (filePath: string) => {
        const fileName = filePath.split('/').pop() || filePath
        // Convert relative path to absolute path if needed
        const fullPath = filePath.startsWith('/') ? filePath : `${vaultPath}/${filePath}`
        await openTab(fullPath, fileName)
    }, [openTab, vaultPath])

    // Apply changes to a single file
    const handleApplyFile = useCallback((filePath: string, applyAllDiffsFn: (actions: AIAction[]) => void) => {
        const diffs = getDiffsForFile(filePath)
        if (diffs.length === 0) return

        // Check if file is currently open
        const isFileOpen = editorGroups.some(group =>
            group.tabs.some(tab => tab.filePath === filePath)
        )

        if (isFileOpen) {
            // File is open - apply diffs through editor
            const actions: AIAction[] = diffs.map(diff => {
                if (diff.type === 'update') {
                    return {
                        type: 'update' as const,
                        id: diff.blockId,
                        content: diff.newContent
                    }
                } else if (diff.type === 'insert') {
                    return {
                        type: 'insert' as const,
                        afterId: diff.blockId,
                        content: diff.newContent,
                        blockType: diff.blockType
                    }
                } else {
                    return {
                        type: 'delete' as const,
                        id: diff.blockId
                    }
                }
            })
            applyAllDiffsFn(actions)
            clearDiffsForFile(filePath)
        } else {
            // File is closed - skip for now (will implement later)
            console.log('Closed file application not yet implemented:', filePath)
            clearDiffsForFile(filePath)
        }
    }, [editorGroups, getDiffsForFile, clearDiffsForFile])

    // Reject changes for a single file
    const handleRejectFile = useCallback((filePath: string) => {
        clearDiffsForFile(filePath)
    }, [clearDiffsForFile])

    // Apply all files
    const handleApplyAll = useCallback((applyAllDiffsFn: (actions: AIAction[]) => void) => {
        const summaries = getAllFileSummaries()
        for (const summary of summaries) {
            handleApplyFile(summary.filePath, applyAllDiffsFn)
        }
    }, [getAllFileSummaries, handleApplyFile])

    // Reject all files
    const handleRejectAll = useCallback(() => {
        const summaries = getAllFileSummaries()
        for (const summary of summaries) {
            clearDiffsForFile(summary.filePath)
        }
    }, [getAllFileSummaries, clearDiffsForFile])

    return {
        handleFileClick,
        handleApplyFile,
        handleRejectFile,
        handleApplyAll,
        handleRejectAll
    }
}
