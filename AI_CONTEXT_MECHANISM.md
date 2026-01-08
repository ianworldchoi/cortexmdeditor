# AI Context & Document Referencing Implementation in Cortex

## 1. Context Gathering Mechanism

The AI system gathers context from multiple sources before sending a request to the LLM (Gemini). This happens primarily in `src/renderer/services/geminiService.ts` within the `sendMessage` function.

### A. Active Document Context
- **Source**: `buildActiveContexts` function.
- **Mechanism**: It takes the currently open documents (`activeDocuments`) and formats their content.
- **Format**: Each block in the document (text, headings, code blocks, etc.) is converted into a structured string format (e.g., `# Heading`, `- Bullet`).
- **Metadata**: Includes Title, ID, Tags, Creation/Update dates, and File Path.
- **Purpose**: Gives the AI immediate awareness of what the user is currently working on.

### B. Smart Context (RAG-lite)
- **Source**: `getSmartContext` function.
- **Trigger**: Based on the user's message content.
- **Logic**:
    1.  **Always-on Docs**: Retrieves documents marked as "Always-on".
    2.  **Tag Triggers**: Scans all vault documents for tags that match keywords in the user's message.
    3.  **Limit**: Merges these lists and limits the result to the top 10 documents.
    4.  **Content Loading**: Reads the file content (first 3000 characters) from the file system.
- **Purpose**: Provides relevant background information from the vault without sending the entire vault.

### C. Mentioned Context (@mentions)
- **Source**: `buildMentionedContext` function.
- **Trigger**: User explicitly mentions files or folders using the `@` syntax.
- **Logic**:
    -   **Files**: Reads the full content (up to 5000 chars) of the mentioned file.
    -   **Folders**: Recursively finds all markdown files within the folder, limits to 10 files, and reads their content (up to 2000 chars each).
- **Purpose**: Allows precise, user-directed context injection.

### D. Chat History
- **Source**: `buildChatHistory` function.
- **Logic**: Retrieves the last 10 messages from the current session.
- **Purpose**: Maintains conversational continuity.

### E. Folder-Specific Prompts
- **Source**: `getFolderPromptForPath` (from `aiStore`).
- **Logic**: Checks if the active document resides in a folder that has a custom system prompt configured. It traverses up the directory tree to find the nearest folder prompt.
- **Purpose**: Enforces specific instructions for certain projects or areas of the vault.

---

## 2. Document Referencing & Embeddings

### Embeddings / Vector Search
- **Current Status**: **Not Implemented.**
- **Observation**: The code relies on "Tag Triggers" and "Always-on" flags for implicit context retrieval (`getSmartContext`). There is no vector database or embedding generation visible in the analyzed files.
- **Mechanism**: Simple keyword matching against document tags (`d.tags.some(tag => lowerMessage.includes(tag.toLowerCase()))`).

### File Path Handling
- **Paths**: Passed as absolute paths (`doc.filePath`) or relative paths depending on the context.
- **Usage**: Used mainly for file system operations (reading content via `window.api.readFile`) and for the AI to identify which file to update in `json:batch-action`.

---

## 3. Communication with LLM

The `sendMessage` function constructs a single prompt string by concatenating all the gathered contexts sections:

1.  **System Prompt**: (Global custom prompt OR Vault-specific prompt)
2.  **Folder Context**: (If applicable)
3.  **Mentioned Context**: (Explicit @mentions)
4.  **Vault Context**: (Smart/Tag-based)
5.  **Active Documents**: (Currently open tabs)
6.  **Chat History**: (Last 10 messages)
7.  **User Message**: The actual query.

This combined string is sent to the Google GenAI `generateContentStream` method.

---

## 4. Mention System Implementation

- **UI**: Handled in `AIPanel.tsx` and `MentionDropdown.tsx`.
- **Detection**: `handleInputChange` detects the `@` character.
- **Selection**: `handleMentionSelect` adds the selected item to `mentionedItems` state and `contextChips`.
- **Processing**: The `mentionedItems` array is passed to `sendMessage`, which then triggers `buildMentionedContext` to read the actual file/folder contents.

## Summary

Cortex uses a **heuristic-based context injection system** rather than a full RAG (Retrieval Augmented Generation) system with embeddings. It relies on:
1.  **Explicit User Intent**: Active tab + @mentions.
2.  **Metadata Matching**: Tag-based retrieval.
3.  **Direct File Access**: Reading raw markdown files on demand.

This approach is "Local-first" and lightweight, avoiding the need for a local vector database, but may limit semantic search capabilities compared to embedding-based solutions.
