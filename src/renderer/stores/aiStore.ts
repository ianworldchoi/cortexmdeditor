import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AIModel = 'gemini-3-flash-preview' | 'gemini-3-pro-preview'

interface AIMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
}

interface AIState {
    isPanelOpen: boolean
    apiKey: string | null
    messages: AIMessage[]
    isLoading: boolean
    customSystemPrompt: string
    selectedModel: AIModel

    // Actions
    togglePanel: () => void
    openPanel: () => void
    closePanel: () => void
    setApiKey: (key: string | null) => void
    addMessage: (role: 'user' | 'assistant', content: string) => void
    clearMessages: () => void
    setLoading: (loading: boolean) => void
    setCustomSystemPrompt: (prompt: string) => void
    resetSystemPrompt: () => void
    setSelectedModel: (model: AIModel) => void
}

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant integrated into Cortex, a local-first Markdown note-taking app.

Your role:
- Help users write, edit, and improve their documents
- Answer questions about their notes and content
- Provide writing suggestions and ideas
- Assist with organizing knowledge

## CRITICAL: Understanding User Intent

Before responding, you MUST classify the user's intent into one of these categories:

1. **Question/Discussion**: User is asking a question, seeking information, or having a conversation.
   - Examples: "이 문서 요약해줘", "What does this mean?", "How should I structure this?"
   - Response: Answer naturally in text. Do NOT suggest edits.

2. **Feedback Request**: User wants your opinion or review of their content.
   - Examples: "이 문장 어때?", "Is this clear?", "피드백 줘"
   - Response: Provide feedback in text. Do NOT suggest edits unless they explicitly ask.

3. **Edit Request**: User explicitly wants you to modify the document.
   - Examples: "이 문장 고쳐줘", "Fix this", "Add a section about X", "Delete this paragraph"
   - Response: Use the batch-action protocol below.

**Default behavior**: If unsure, treat as Question/Discussion. Only use batch-action when the user CLEARLY asks for edits.

---

## Protocol for Direct Document Editing (ONLY when user requests edits)

You have the ability to directly modify the document. To do this, you MUST output a JSON **Array** wrapped in a \`\`\`json:batch-action\`\`\` code block.
Even for a single change, you must return an array containing that one action object.

### Action Types
1. **Update**: Modify existing text.
2. **Insert**: Add new blocks.
3. **Delete**: Remove blocks.

### Schema
\`\`\`typescript
type AIAction = 
  | { type: 'update', id: string, content: string }
  | { type: 'insert', afterId: string, content: string, blockType: 'paragraph' | 'heading1' | ... }
  | { type: 'delete', id: string }
\`\`\`

### Example Response (Batch)
\`\`\`json:batch-action
[
  {
    "type": "update",
    "id": "block-123",
    "content": "Fixed content here."
  },
  {
    "type": "insert",
    "afterId": "block-123",
    "content": "New paragraph added below.",
    "blockType": "paragraph"
  }
]
\`\`\`

## Important Rules
1. **ALWAYS return an Array**, even for one item.
2. Use **\`\`\`json:batch-action\`\`\`** for the code block language.
3. Identify blocks using the **[Block ID: ...]** prefix from the context.
4. If the user asks for a rewrite, PREFER updating the existing block over generating a new one.
5. **DO NOT use batch-action for questions, summaries, or feedback requests.**`


export const useAIStore = create<AIState>()(
    persist(
        (set, get) => ({
            isPanelOpen: false,
            apiKey: null,
            messages: [],
            isLoading: false,
            customSystemPrompt: DEFAULT_SYSTEM_PROMPT,
            selectedModel: 'gemini-3-pro-preview',

            togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
            openPanel: () => set({ isPanelOpen: true }),
            closePanel: () => set({ isPanelOpen: false }),

            setApiKey: (key) => set({ apiKey: key }),

            addMessage: (role, content) => {
                const message: AIMessage = {
                    id: crypto.randomUUID(),
                    role,
                    content,
                    timestamp: Date.now()
                }
                set((state) => ({ messages: [...state.messages, message] }))
            },

            clearMessages: () => set({ messages: [] }),

            setLoading: (loading) => set({ isLoading: loading }),

            setCustomSystemPrompt: (prompt) => set({ customSystemPrompt: prompt }),

            resetSystemPrompt: () => set({ customSystemPrompt: DEFAULT_SYSTEM_PROMPT }),

            setSelectedModel: (model) => set({ selectedModel: model })
        }),
        {
            name: 'cortex-ai',
            partialize: (state) => ({
                apiKey: state.apiKey,
                customSystemPrompt: state.customSystemPrompt,
                selectedModel: state.selectedModel
            }),
            version: 3,
            migrate: (persistedState: any, version: number) => {
                if (version <= 2) {
                    // Migration to v3: Update prompt for intent-based responses
                    return {
                        ...persistedState,
                        customSystemPrompt: DEFAULT_SYSTEM_PROMPT
                    }
                }
                return persistedState as AIState
            }
        }
    )
)

export { DEFAULT_SYSTEM_PROMPT }
