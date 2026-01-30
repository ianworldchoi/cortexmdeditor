import type { PendingDiff, Block } from '@shared/types'

interface AIAction {
    type: 'update' | 'insert' | 'delete' | 'create_file' | 'create_folder' | 'update_meta' | 'update_file'
    id?: string
    afterId?: string
    content?: string
    blockType?: string
    path?: string
    metaField?: string
    metaValue?: any
}

interface ActiveDocument {
    blocks: Block[]
    filePath: string
}

// Helper function to convert AIActions to PendingDiffs
export const convertActionsToDiffs = (
    actions: AIAction[],
    activeDoc: ActiveDocument | null
): PendingDiff[] => {
    return actions
        .filter(a => a.type === 'update' || a.type === 'insert' || a.type === 'delete' || a.type === 'update_file')
        .map(action => {
            // For update_file, we don't have blocks yet (will be loaded later)
            if (action.type === 'update_file') {
                return {
                    id: crypto.randomUUID(),
                    blockId: 'file-update',
                    type: 'update' as const,
                    status: 'pending' as const,
                    newContent: action.content,
                    oldContent: undefined
                }
            }

            // For other types, we need activeDoc
            if (!activeDoc) {
                console.warn('convertActionsToDiffs: activeDoc is null for non-file actions')
                return null
            }

            const diff: PendingDiff = {
                id: crypto.randomUUID(),
                blockId: action.id || action.afterId || '',
                type: action.type as 'update' | 'insert' | 'delete',
                status: 'pending'
            }

            if (action.type === 'update' && action.id) {
                const oldBlock = activeDoc.blocks.find((b: Block) => b.block_id === action.id)
                diff.oldContent = oldBlock?.content
                diff.newContent = action.content
            } else if (action.type === 'insert') {
                diff.newContent = action.content
                diff.blockType = action.blockType as any
            } else if (action.type === 'delete' && action.id) {
                const oldBlock = activeDoc.blocks.find((b: Block) => b.block_id === action.id)
                diff.oldContent = oldBlock?.content
            }

            return diff
        })
        .filter((diff): diff is PendingDiff => diff !== null)
}
