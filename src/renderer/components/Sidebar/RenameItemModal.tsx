import { useState, useEffect } from 'react'
import { X, Edit3 } from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'
import { useAIStore } from '../../stores/aiStore'
import type { FileNode } from '@shared/types'

interface RenameItemModalProps {
    node: FileNode
    onClose: () => void
}

export default function RenameItemModal({
    node,
    onClose
}: RenameItemModalProps) {
    const { renameItem } = useVaultStore()
    const { folderPrompts, setFolderPrompt, deleteFolderPrompt } = useAIStore()
    const [name, setName] = useState(node.name)
    const [prompt, setPrompt] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Load existing prompt for folders
    useEffect(() => {
        if (node.isDirectory && folderPrompts[node.path]) {
            setPrompt(folderPrompts[node.path])
        }
    }, [node.isDirectory, node.path, folderPrompts])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!name.trim()) {
            setError('Name is required')
            return
        }

        if (name === node.name) {
            onClose()
            return
        }

        setIsLoading(true)
        setError(null)

        try {
            const success = await renameItem(node.path, name.trim())
            if (success) {
                // Handle folder prompt on rename
                if (node.isDirectory) {
                    const parentPath = node.path.substring(0, node.path.lastIndexOf('/'))
                    const newPath = `${parentPath}/${name.trim()}`

                    // Delete old path prompt if it existed
                    if (folderPrompts[node.path]) {
                        deleteFolderPrompt(node.path)
                    }

                    // Save new prompt (or update to new path)
                    if (prompt.trim()) {
                        setFolderPrompt(newPath, prompt.trim())
                    }
                }
                onClose()
            } else {
                // Error is set in store, but we can capture generic failure too
                // For better UX we rely on store error, or we could pass down specific error
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose()
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleKeyDown}
                style={{ maxWidth: 360 }}
            >
                <div className="modal-header">
                    <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Edit3 size={18} />
                        Rename Item
                    </h2>
                    <button className="ai-panel-close" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">
                                Name
                            </label>
                            <input
                                type="text"
                                className="form-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                autoFocus
                            />
                            {node.isDirectory && (
                                <>
                                    <label className="form-label" style={{ marginTop: 16 }}>
                                        AI Prompt (optional)
                                    </label>
                                    <textarea
                                        className="form-input"
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="이 폴더의 파일에서 AI 질문 시 자동으로 적용됩니다"
                                        rows={3}
                                        style={{ resize: 'vertical', minHeight: 72 }}
                                    />
                                    <p
                                        style={{
                                            marginTop: 8,
                                            fontSize: 'var(--text-xs)',
                                            color: 'var(--color-text-tertiary)'
                                        }}
                                    >
                                        비워두면 프롬프트가 제거됩니다
                                    </p>
                                </>
                            )}
                            {error && (
                                <p
                                    style={{
                                        marginTop: 8,
                                        fontSize: 'var(--text-sm)',
                                        color: 'var(--color-error)'
                                    }}
                                >
                                    {error}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isLoading || !name.trim()}
                        >
                            {isLoading ? 'Renaming...' : 'Rename'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
