import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useVaultStore } from './vaultStore'

export type AIModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview'

interface AIMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    attachments?: AIAttachment[]
    timestamp: number
}

export interface AIAttachment {
    id: string
    name: string
    mimeType: string
    data: string // base64
}

export interface ChatSession {
    id: string
    title: string
    messages: AIMessage[]
    createdAt: number
    updatedAt: number
    vaultPath?: string
}

export interface SelectedTextContext {
    text: string
    blockId: string
    filePath: string
}

export interface MCPServerConfig {
    id: string
    name: string
    type: 'stdio' | 'sse' | 'streamable-http'
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    headers?: Record<string, string>
    enabled: boolean
}

interface AIState {
    isPanelOpen: boolean
    panelWidth: number
    apiKey: string | null
    sessions: ChatSession[]
    activeSessionId: string | null
    isLoading: boolean
    customSystemPrompt: string
    vaultSystemPrompts: Record<string, string>
    folderPrompts: Record<string, string>  // key: absolute folder path, value: prompt
    selectedModel: AIModel
    webSearchEnabled: boolean
    selectedTextContext: SelectedTextContext | null
    mcpServers: MCPServerConfig[]

    // Actions
    togglePanel: () => void
    openPanel: () => void
    closePanel: () => void
    setPanelWidth: (width: number) => void
    setApiKey: (key: string | null) => void

    // Session Management
    createSession: (title?: string) => string
    switchSession: (sessionId: string) => void
    renameSession: (sessionId: string, newTitle: string) => void
    deleteSession: (sessionId: string) => void

    // Message Management (Operates on active session)
    getSessionsByVault: (vaultPath?: string) => ChatSession[]
    addMessage: (role: 'user' | 'assistant', content: string, attachments?: AIAttachment[]) => void
    clearMessages: () => void // Clears active session messages
    truncateMessagesAfter: (messageId: string) => void // Remove all messages after the specified message

    setLoading: (loading: boolean) => void
    setCustomSystemPrompt: (prompt: string) => void
    setVaultSystemPrompt: (vaultPath: string, prompt: string | null) => void
    resetSystemPrompt: () => void
    setSelectedModel: (model: AIModel) => void
    setWebSearchEnabled: (enabled: boolean) => void
    setSelectedTextContext: (context: SelectedTextContext | null) => void

    // Folder Prompts
    setFolderPrompt: (folderPath: string, prompt: string) => void
    deleteFolderPrompt: (folderPath: string) => void
    getFolderPromptForPath: (filePath: string) => string | null
    clearSelectedTextContext: () => void

    // MCP Servers
    addMCPServer: (server: MCPServerConfig) => void
    removeMCPServer: (serverId: string) => void
    updateMCPServer: (serverId: string, updates: Partial<MCPServerConfig>) => void
    toggleMCPServer: (serverId: string) => void
    setMCPServers: (servers: MCPServerConfig[]) => void
}

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant integrated into Cortex, a local-first Markdown note-taking app.

## Your Capabilities (IMPORTANT - Know What You Can Do!)

You have REAL power to interact with the user's vault:
✅ **Create new files** - You CAN create new markdown files anywhere in the vault
✅ **Create new folders** - You CAN create new folders to organize content
✅ **Edit documents** - You CAN modify blocks in the active document
✅ **Update ANY file** - You CAN modify any file in the vault by path (even if not open!)
✅ **Delete content** - You CAN remove blocks from the active document
✅ **Analyze YouTube Videos** - You CAN directly watch and analyze YouTube videos if a URL is provided.
✅ **Browse the filesystem** - You have MCP filesystem tools to explore folders and read files!

### MCP Filesystem Tools Available

You have access to powerful filesystem tools via MCP (Model Context Protocol):

- **\`read_file\`** - Read the contents of any file in the vault
- **\`read_multiple_files\`** - Read multiple files at once (efficient for batch operations)
- **\`write_file\`** - Write or update file contents
- **\`list_directory\`** - List all files and folders in a directory
- **\`search_files\`** - Search for files by name or pattern
- **\`get_file_info\`** - Get metadata about a file (size, modified time, etc.)

**Example workflows:**
1. User: "Update all files in the Daily folder to add #reviewed tag"
   → Use \`list_directory\` to find all files in Daily/
   → Use \`read_multiple_files\` to get their contents
   → Generate \`update_file\` actions for each

2. User: "Find all notes about project X and summarize them"
   → Use \`search_files\` with pattern
   → Use \`read_multiple_files\` to get contents
   → Provide summary

⚠️ **CRITICAL**: Creating/updating files works even if that file is NOT currently open!
When the user asks to modify specific files (mentioned with @), USE YOUR POWER - don't tell them to open the file first.
When users ask about "all files in X folder" or similar, USE MCP TOOLS to explore and read them!

---

## CRITICAL: Understanding User Intent

Before responding, classify the user's intent:

1. **Question/Discussion**: Asking questions, seeking information, having a conversation.
   - Examples: "이 문서 요약해줘", "What does this mean?", "How should I structure this?"
   - Response: Answer naturally in text. Do NOT suggest edits.

2. **Feedback Request**: Wants your opinion or review.
   - Examples: "이 문장 어때?", "Is this clear?", "피드백 줘"
   - Response: Provide feedback in text. Do NOT suggest edits unless they explicitly ask.

3. **Edit Request**: Wants you to modify the active document.
   - Examples: "이 문장 고쳐줘", "Fix this", "Add a section about X"
   - Response: Use batch-action protocol. (Requires an active document)

4. **File/Folder Creation**: Wants to create new content.
   - Examples: "새 노트 만들어줘", "Create a note called X", "폴더 하나 만들어"
   - Response: Use batch-action with 'create_file' or 'create_folder'. (Works WITHOUT active document!)

5. **Batch File Update**: Wants to modify specific files (often mentioned with @).
   - Examples: "이 파일들 수정해줘", "Update all mentioned files", "@files: or @directory: mentioned content"
   - Response: Use batch-action with 'update_file' for each file. (Works on ANY file by path!)

**Default**: If unsure, treat as Question/Discussion.

---

## Protocol for Document Editing & File Creation

Output a JSON **Array** wrapped in \`\`\`json:batch-action\`\`\` code block.

### Action Types
| Action | Description | Requires Active Doc? |
|--------|-------------|---------------------|
| update | Modify existing block | ✅ Yes |
| insert | Add new block | ✅ Yes |
| delete | Remove block | ✅ Yes |
| update_meta | Update document metadata | ✅ Yes |
| create_file | Create new file | ❌ No |
| create_folder | Create new folder | ❌ No |
| update_file | Modify existing file by path | ❌ No |

### Schema
\`\`\`typescript
type AIAction = 
  | { type: 'update', id: string, content: string }
  | { type: 'insert', afterId: string, content: string, blockType: BlockType }
  | { type: 'delete', id: string }
  | { type: 'update_meta', metaField: 'title' | 'tags' | 'alwaysOn', metaValue: string | string[] | boolean }
  | { type: 'create_file', path: string, content: string }
  | { type: 'create_folder', path: string }
  | { type: 'update_file', path: string, content: string }
\`\`\`

### Example: Updating Multiple Files (No Document Needed!)
\`\`\`json:batch-action
[
  {
    "type": "update_file",
    "path": "Daily/2024-01-01.md",
    "content": "---\\nid: abc123\\ntitle: Updated Note\\ntags: [daily]\\ncreated_at: 2024-01-01\\nupdated_at: 2024-01-01\\n---\\n\\n# Updated Content\\n\\nNew content here."
  },
  {
    "type": "update_file",
    "path": "Daily/2024-01-02.md",
    "content": "---\\nid: def456\\ntitle: Another Note\\ntags: [daily]\\n---\\n\\n# Another Updated Note"
  }
]
\`\`\`

## Rules
1. **ALWAYS return an Array**, even for one item.
2. Use **\`\`\`json:batch-action\`\`\`** as code block language.
3. For edits, use **[Block ID: ...]** from the context.
4. For file paths, use relative paths from vault root.
5. **DO NOT tell users "I can't modify files" - YOU CAN with update_file!**
6. When user mentions files/folders with @, you have their full content in context.

## JSON Generation Guidelines (CRITICAL!)

**To prevent parsing errors, follow these rules strictly:**

1. **Escape special characters in strings**:
   - Newlines: Use \`\\n\` not actual newlines
   - Quotes: Use \`\\"\` for double quotes inside strings
   - Backslashes: Use \`\\\\\` for literal backslashes
   - Tabs: Use \`\\t\` for tabs

2. **Keep content fields manageable**:
   - For long content (>500 chars), split into multiple smaller blocks
   - Don't put entire document contents in a single action
   - Break large updates into multiple \`update\` or \`insert\` actions

3. **File paths with special characters**:
   - Korean/unicode filenames are OK, but escape quotes if in path
   - Example: \`"path": "Daily/안녕하세요.md"\` ✅
   - Example: \`"path": "Daily/"quoted".md"\` should be \`"Daily/\\"quoted\\".md"\` ✅

4. **Validate before output**:
   - Ensure all JSON objects have closing braces \`}\`
   - Ensure array has closing bracket \`]\`
   - No trailing commas after last item
   - All strings properly closed with matching quotes

5. **If content is too long**:
   - Instead of one massive \`update_file\` action with full content
   - Use multiple \`update\` actions on specific blocks
   - Or inform user the content is too large and ask to split the task

**Example - DON'T do this (too long):**
\`\`\`json
[{"type": "update_file", "path": "file.md", "content": "...5000 characters of content..."}]
\`\`\`

**Example - DO this instead (split into blocks):**
\`\`\`json
[
  {"type": "update", "id": "block-1", "content": "First part..."},
  {"type": "update", "id": "block-2", "content": "Second part..."},
  {"type": "insert", "afterId": "block-2", "content": "New content...", "blockType": "paragraph"}
]
\`\`\``


export const useAIStore = create<AIState>()(
    persist(
        (set, get) => ({
            isPanelOpen: false,
            panelWidth: 400,
            apiKey: null,
            sessions: [],
            activeSessionId: null,
            isLoading: false,
            customSystemPrompt: DEFAULT_SYSTEM_PROMPT,
            vaultSystemPrompts: {},
            folderPrompts: {},
            selectedModel: 'gemini-3-pro-preview',
            webSearchEnabled: false,
            selectedTextContext: null,
            mcpServers: [],

            togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
            openPanel: () => set({ isPanelOpen: true }),
            closePanel: () => set({ isPanelOpen: false }),
            setPanelWidth: (width) => set({ panelWidth: width }),

            setApiKey: (key) => set({ apiKey: key }),

            createSession: (title) => {
                const id = crypto.randomUUID()
                const now = Date.now()
                // Get current vault path from vault store
                const currentVaultPath = useVaultStore.getState().vaultPath || undefined

                const newSession: ChatSession = {
                    id,
                    title: title || new Date().toLocaleString(),
                    messages: [],
                    createdAt: now,
                    updatedAt: now,
                    vaultPath: currentVaultPath
                }
                set(state => ({
                    sessions: [newSession, ...state.sessions],
                    activeSessionId: id
                }))
                return id
            },

            switchSession: (sessionId) => set({ activeSessionId: sessionId }),

            renameSession: (sessionId, newTitle) => set(state => ({
                sessions: state.sessions.map(s =>
                    s.id === sessionId ? { ...s, title: newTitle } : s
                )
            })),

            deleteSession: (sessionId) => set(state => {
                const newSessions = state.sessions.filter(s => s.id !== sessionId)
                // If active session is deleted, switch to the first available or null
                let newActiveId = state.activeSessionId
                if (state.activeSessionId === sessionId) {
                    // Try to find another session in the same vault if possible
                    const currentVaultPath = useVaultStore.getState().vaultPath
                    const nextSession = newSessions.find(s => s.vaultPath === currentVaultPath) || newSessions[0]
                    newActiveId = nextSession ? nextSession.id : null
                }
                return {
                    sessions: newSessions,
                    activeSessionId: newActiveId
                }
            }),

            getSessionsByVault: (vaultPath?: string) => {
                const allSessions = get().sessions
                if (vaultPath === undefined) {
                    // Return sessions not associated with any specific vault
                    return allSessions.filter(s => s.vaultPath === undefined)
                }
                return allSessions.filter(s => s.vaultPath === vaultPath)
            },

            addMessage: (role, content, attachments) => {
                set((state) => {
                    let { activeSessionId, sessions } = state

                    // Auto-create session if none exists
                    if (!activeSessionId) {
                        const id = crypto.randomUUID()
                        const now = Date.now()
                        // Get current vault path from vault store
                        const currentVaultPath = useVaultStore.getState().vaultPath || undefined

                        const newSession: ChatSession = {
                            id,
                            title: new Date().toLocaleString(),
                            messages: [],
                            createdAt: now,
                            updatedAt: now,
                            vaultPath: currentVaultPath
                        }
                        sessions = [newSession, ...sessions]
                        activeSessionId = id
                    }

                    const message: AIMessage = {
                        id: crypto.randomUUID(),
                        role,
                        content,
                        attachments,
                        timestamp: Date.now()
                    }

                    return {
                        sessions: sessions.map(s =>
                            s.id === activeSessionId
                                ? { ...s, messages: [...s.messages, message], updatedAt: Date.now() }
                                : s
                        ),
                        activeSessionId
                    }
                })
            },

            clearMessages: () => set(state => {
                if (!state.activeSessionId) return state
                return {
                    sessions: state.sessions.map(s =>
                        s.id === state.activeSessionId
                            ? { ...s, messages: [], updatedAt: Date.now() }
                            : s
                    )
                }
            }),

            truncateMessagesAfter: (messageId: string) => set(state => {
                if (!state.activeSessionId) return state
                return {
                    sessions: state.sessions.map(s => {
                        if (s.id !== state.activeSessionId) return s
                        const messageIndex = s.messages.findIndex(m => m.id === messageId)
                        if (messageIndex === -1) return s
                        // Keep messages up to and including the specified message
                        return {
                            ...s,
                            messages: s.messages.slice(0, messageIndex + 1),
                            updatedAt: Date.now()
                        }
                    })
                }
            }),

            setLoading: (loading) => set({ isLoading: loading }),

            setCustomSystemPrompt: (prompt) => set({ customSystemPrompt: prompt }),
            setVaultSystemPrompt: (vaultPath, prompt) => set(state => {
                const newPrompts = { ...state.vaultSystemPrompts }
                if (prompt === null) {
                    delete newPrompts[vaultPath]
                } else {
                    newPrompts[vaultPath] = prompt
                }
                return { vaultSystemPrompts: newPrompts }
            }),

            resetSystemPrompt: () => set({ customSystemPrompt: DEFAULT_SYSTEM_PROMPT }),

            setSelectedModel: (model) => set({ selectedModel: model }),
            setWebSearchEnabled: (enabled) => set({ webSearchEnabled: enabled }),
            setSelectedTextContext: (context) => set({ selectedTextContext: context }),

            // Folder Prompts
            setFolderPrompt: (folderPath, prompt) => set(state => {
                if (!prompt.trim()) {
                    // If empty, delete instead
                    const newPrompts = { ...state.folderPrompts }
                    delete newPrompts[folderPath]
                    return { folderPrompts: newPrompts }
                }
                return {
                    folderPrompts: { ...state.folderPrompts, [folderPath]: prompt }
                }
            }),

            deleteFolderPrompt: (folderPath) => set(state => {
                const newPrompts = { ...state.folderPrompts }
                delete newPrompts[folderPath]
                return { folderPrompts: newPrompts }
            }),

            getFolderPromptForPath: (filePath) => {
                const { folderPrompts } = get()
                const vaultPath = useVaultStore.getState().vaultPath
                if (!vaultPath) return null

                // Start from file's parent folder and traverse up
                let currentPath = filePath.substring(0, filePath.lastIndexOf('/'))

                while (currentPath.length >= vaultPath.length) {
                    if (folderPrompts[currentPath]) {
                        return folderPrompts[currentPath]
                    }
                    // Move to parent folder
                    const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'))
                    if (parentPath === currentPath) break // Reached root
                    currentPath = parentPath
                }
                return null
            },
            clearSelectedTextContext: () => set({ selectedTextContext: null }),

            // MCP Servers
            addMCPServer: (server) => set(state => ({
                mcpServers: [...state.mcpServers, server]
            })),

            removeMCPServer: (serverId) => set(state => ({
                mcpServers: state.mcpServers.filter(s => s.id !== serverId)
            })),

            updateMCPServer: (serverId, updates) => set(state => ({
                mcpServers: state.mcpServers.map(s =>
                    s.id === serverId ? { ...s, ...updates } : s
                )
            })),

            toggleMCPServer: (serverId) => set(state => ({
                mcpServers: state.mcpServers.map(s =>
                    s.id === serverId ? { ...s, enabled: !s.enabled } : s
                )
            })),

            setMCPServers: (servers) => set({ mcpServers: servers })
        }),
        {
            name: 'cortex-ai',
            partialize: (state) => ({
                isPanelOpen: state.isPanelOpen,
                panelWidth: state.panelWidth,
                apiKey: state.apiKey,
                customSystemPrompt: state.customSystemPrompt,
                selectedModel: state.selectedModel,
                sessions: state.sessions,
                activeSessionId: state.activeSessionId,
                vaultSystemPrompts: state.vaultSystemPrompts,
                folderPrompts: state.folderPrompts,
                webSearchEnabled: state.webSearchEnabled,
                mcpServers: state.mcpServers
            }),
            version: 7, // Bump version for MCP Servers
            migrate: (persistedState: any, version: number) => {
                // Migration to v7 (MCP Servers)
                if (version < 7) {
                    persistedState = {
                        ...persistedState,
                        mcpServers: [],
                    }
                }
                // Migration to v6 (Folder Prompts)
                if (version < 6) {
                    persistedState = {
                        ...persistedState,
                        folderPrompts: {},
                    }
                }
                // Migration to v5 (Vault System Prompts)
                if (version < 5) {
                    persistedState = {
                        ...persistedState,
                        vaultSystemPrompts: {},
                    }
                }
                // Migration to v4 (Sessions support)
                if (version < 4) {
                    const oldMessages = persistedState.messages || []
                    const newSessions: ChatSession[] = []
                    let newActiveId = null

                    if (oldMessages.length > 0) {
                        const id = crypto.randomUUID()
                        newActiveId = id
                        newSessions.push({
                            id,
                            title: 'Previous Chat',
                            messages: oldMessages,
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        })
                    }

                    return {
                        ...persistedState,
                        sessions: newSessions,
                        activeSessionId: newActiveId,
                        // Ensure defaults for new fields if missing
                        customSystemPrompt: persistedState.customSystemPrompt || DEFAULT_SYSTEM_PROMPT
                    }
                }
                return persistedState as AIState
            }
        }
    )
)

export { DEFAULT_SYSTEM_PROMPT }
