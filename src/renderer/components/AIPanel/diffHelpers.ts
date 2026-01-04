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
    if (!activeDoc) return []

    return actions
        .filter(a => a.type === 'update' || a.type === 'insert' || a.type === 'delete')
        .map(action => {
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
}
