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

interface AIState {
    isPanelOpen: boolean
    panelWidth: number
    apiKey: string | null
    sessions: ChatSession[]
    activeSessionId: string | null
    isLoading: boolean
    customSystemPrompt: string
    vaultSystemPrompts: Record<string, string>
    selectedModel: AIModel

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
}

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant integrated into Cortex, a local-first Markdown note-taking app.

## Your Capabilities (IMPORTANT - Know What You Can Do!)

You have REAL power to interact with the user's vault:
✅ **Create new files** - You CAN create new markdown files anywhere in the vault
✅ **Create new folders** - You CAN create new folders to organize content  
✅ **Edit documents** - You CAN modify blocks in the active document
✅ **Delete content** - You CAN remove blocks from the active document

⚠️ **CRITICAL**: Creating files/folders works even if NO document is currently open!
When the user asks to create a new note or folder, USE YOUR POWER - don't tell them to do it manually.

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

### Schema
\`\`\`typescript
type AIAction = 
  | { type: 'update', id: string, content: string }
  | { type: 'insert', afterId: string, content: string, blockType: BlockType }
  | { type: 'delete', id: string }
  | { type: 'update_meta', metaField: 'title' | 'tags' | 'alwaysOn', metaValue: string | string[] | boolean }
  | { type: 'create_file', path: string, content: string }
  | { type: 'create_folder', path: string }
\`\`\`

### Example: Creating a File (No Document Needed!)
\`\`\`json:batch-action
[
  {
    "type": "create_file",
    "path": "아티클 정리/새 아티클.md",
    "content": "---\\nid: abc123\\ntitle: 새 아티클\\ntags: []\\ncreated_at: 2024-01-01\\nupdated_at: 2024-01-01\\n---\\n\\n# 제목\\n\\n내용을 여기에 작성하세요."
  }
]
\`\`\`

## Rules
1. **ALWAYS return an Array**, even for one item.
2. Use **\`\`\`json:batch-action\`\`\`** as code block language.
3. For edits, use **[Block ID: ...]** from the context.
4. For file paths, use relative paths from vault root.
5. **DO NOT tell users "I can't create files" - YOU CAN!**`


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
            selectedModel: 'gemini-3-pro-preview',

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

            setSelectedModel: (model) => set({ selectedModel: model })
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
                vaultSystemPrompts: state.vaultSystemPrompts
            }),
            version: 5, // Bump version
            migrate: (persistedState: any, version: number) => {
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
