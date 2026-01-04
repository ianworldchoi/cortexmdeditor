import { create } from 'zustand'

interface HighlightState {
    // Modal state
    isModalOpen: boolean
    modalMode: 'create' | 'edit'

    // Current highlight being created/edited
    selectedText: string
    selectedRange: { blockId: string; start: number; end: number } | null
    comment: string

    // For editing existing highlights
    editingHighlight: {
        blockId: string
        originalText: string
        comment: string
    } | null

    // Actions
    openCreateModal: (text: string, blockId: string, start: number, end: number) => void
    openEditModal: (blockId: string, originalText: string, comment: string) => void
    closeModal: () => void
    setComment: (comment: string) => void
    reset: () => void
}

export const useHighlightStore = create<HighlightState>((set) => ({
    isModalOpen: false,
    modalMode: 'create',
    selectedText: '',
    selectedRange: null,
    comment: '',
    editingHighlight: null,

    openCreateModal: (text, blockId, start, end) => set({
        isModalOpen: true,
        modalMode: 'create',
        selectedText: text,
        selectedRange: { blockId, start, end },
        comment: '',
        editingHighlight: null
    }),

    openEditModal: (blockId, originalText, comment) => set({
        isModalOpen: true,
        modalMode: 'edit',
        selectedText: originalText,
        selectedRange: null,
        comment: comment,
        editingHighlight: { blockId, originalText, comment }
    }),

    closeModal: () => set({
        isModalOpen: false,
        selectedText: '',
        selectedRange: null,
        comment: '',
        editingHighlight: null
    }),

    setComment: (comment) => set({ comment }),

    reset: () => set({
        isModalOpen: false,
        modalMode: 'create',
        selectedText: '',
        selectedRange: null,
        comment: '',
        editingHighlight: null
    })
}))
