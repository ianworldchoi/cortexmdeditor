import { useState, useRef, useEffect } from 'react'
import { X, MessageSquare, Edit2, Trash2, Check, MoreVertical } from 'lucide-react'
import { useAIStore, type ChatSession } from '../../stores/aiStore'

interface SessionHistoryModalProps {
    onClose: () => void
}

import { useVaultStore } from '../../stores/vaultStore'

export default function SessionHistoryModal({ onClose }: SessionHistoryModalProps) {
    const { sessions, activeSessionId, switchSession, renameSession, deleteSession } = useAIStore()
    const { vaultPath } = useVaultStore()
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [openMenuId, setOpenMenuId] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    // Filter sessions for current vault or legacy (undefined)
    const vaultSessions = sessions.filter(
        s => s.vaultPath === vaultPath || (!s.vaultPath && !vaultPath) || (s.vaultPath === undefined)
    )

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleSwitch = (id: string) => {
        switchSession(id)
        onClose()
    }

    const startEdit = (session: ChatSession, e: React.MouseEvent) => {
        e.stopPropagation()
        setEditingId(session.id)
        setEditTitle(session.title)
        setOpenMenuId(null)
    }

    const saveEdit = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (editingId && editTitle.trim()) {
            renameSession(editingId, editTitle.trim())
            setEditingId(null)
        }
    }

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (confirm('Delete this chat session?')) {
            deleteSession(id)
        }
        setOpenMenuId(null)
    }

    const toggleMenu = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setOpenMenuId(openMenuId === id ? null : id)
    }

    // Format date helper
    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '400px', maxHeight: '500px', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Chat History</h2>
                    <button className="modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {vaultSessions.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '20px' }}>
                            No chat history for this vault.
                        </div>
                    ) : (
                        <div className="session-list">
                            {vaultSessions.map(session => (
                                <div
                                    key={session.id}
                                    className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                                    onClick={() => handleSwitch(session.id)}
                                >
                                    <div className="session-icon">
                                        <MessageSquare size={16} />
                                    </div>

                                    <div className="session-info">
                                        {editingId === session.id ? (
                                            <div className="session-edit-input" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    value={editTitle}
                                                    onChange={e => setEditTitle(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') saveEdit(e as any)
                                                        if (e.key === 'Escape') setEditingId(null)
                                                    }}
                                                    autoFocus
                                                />
                                                <button onClick={saveEdit} title="Save">
                                                    <Check size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="session-title">{session.title}</div>
                                                <div className="session-date">{formatDate(session.updatedAt)}</div>
                                            </>
                                        )}
                                    </div>

                                    {editingId !== session.id && (
                                        <div className="session-actions">
                                            <button
                                                className="session-menu-btn"
                                                onClick={(e) => toggleMenu(session.id, e)}
                                            >
                                                <MoreVertical size={16} />
                                            </button>

                                            {openMenuId === session.id && (
                                                <div className="session-popup-menu" ref={menuRef}>
                                                    <button onClick={(e) => startEdit(session, e)}>
                                                        <Edit2 size={14} /> Rename
                                                    </button>
                                                    <button onClick={(e) => handleDelete(session.id, e)} className="danger">
                                                        <Trash2 size={14} /> Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <style>
                {`
                .session-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .session-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 12px;
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    background: var(--color-bg-primary);
                    border: 1px solid transparent;
                    transition: all 0.2s;
                }
                .session-item:hover {
                    background: var(--color-bg-tertiary);
                }
                .session-item.active {
                    background: var(--color-bg-secondary);
                    border-color: var(--color-accent);
                }
                .session-icon {
                    color: var(--color-text-tertiary);
                    display: flex;
                    align-items: center;
                }
                .session-item.active .session-icon {
                    color: var(--color-accent);
                }
                .session-info {
                    flex: 1;
                    min-width: 0;
                }
                .session-title {
                    font-weight: 500;
                    color: var(--color-text-primary);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .session-date {
                    font-size: 11px;
                    color: var(--color-text-tertiary);
                    margin-top: 2px;
                }
                .session-actions {
                    position: relative;
                }
                .session-menu-btn {
                    padding: 4px;
                    border-radius: 4px;
                    color: var(--color-text-tertiary);
                    cursor: pointer;
                    background: transparent;
                    border: none;
                }
                .session-menu-btn:hover {
                    background: var(--color-bg-tertiary);
                    color: var(--color-text-primary);
                }
                .session-popup-menu {
                    position: absolute;
                    top: 100%;
                    right: 0;
                    width: 120px;
                    background: var(--color-bg-secondary);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    z-index: 100;
                    padding: 4px;
                    display: flex;
                    flex-direction: column;
                }
                .session-popup-menu button {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 12px;
                    font-size: 13px;
                    color: var(--color-text-primary);
                    background: transparent;
                    border: none;
                    text-align: left;
                    cursor: pointer;
                    border-radius: 2px;
                }
                .session-popup-menu button:hover {
                    background: var(--color-bg-tertiary);
                }
                .session-popup-menu button.danger {
                    color: var(--color-danger);
                }
                .session-popup-menu button.danger:hover {
                    background: rgba(255, 0, 0, 0.1);
                }
                .session-edit-input {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .session-edit-input input {
                    flex: 1;
                    background: var(--color-bg-tertiary);
                    border: 1px solid var(--color-border);
                    border-radius: 4px;
                    padding: 4px 6px;
                    font-size: 13px;
                    color: var(--color-text-primary);
                }
                .session-edit-input button {
                    background: var(--color-success);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                }
                `}
            </style>
        </div>
    )
}
