// Block types supported in Cortex
export type BlockType =
    | 'text'
    | 'heading1'
    | 'heading2'
    | 'heading3'
    | 'bullet'
    | 'numbered'
    | 'todo'
    | 'quote'
    | 'code'
    | 'divider'
    | 'callout'
    | 'image'

// A single block in the editor
export interface Block {
    block_id: string
    type: BlockType
    content: string
    checked?: boolean // for todo blocks
    language?: string // for code blocks
    children?: Block[]
}

// Document metadata from YAML frontmatter
export interface DocumentMeta {
    id: string
    title: string
    tags: string[]
    created_at: string
    updated_at: string
}

// Full document structure
export interface Document {
    meta: DocumentMeta
    blocks: Block[]
    filePath: string
}

// File tree node for vault sidebar
export interface FileNode {
    name: string
    path: string
    isDirectory: boolean
    children?: FileNode[]
}

// AI edit response format
export interface AIEditResponse {
    action: 'edit_blocks'
    target: string
    diff: BlockDiff[]
    explanation: string
}

export interface BlockDiff {
    block_id: string
    operation: 'replace' | 'insert' | 'delete'
    content?: string
    after_block_id?: string // for insert operation
}

// AI context types
export interface PrimaryContext {
    activeDocument: Document | null
    mentionedDocuments: Document[]
}

export interface VaultContext {
    documents: Array<{
        id: string
        title: string
        tags: string[]
        path: string
    }>
}

// IPC channel types
export type IpcChannels =
    | 'vault:select'
    | 'vault:read-tree'
    | 'file:read'
    | 'file:write'
    | 'file:create'
    | 'file:delete'
    | 'dialog:open-folder'
