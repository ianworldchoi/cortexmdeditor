import { useState } from 'react'
import { X, Check } from 'lucide-react'
import type { PendingDiff } from '@shared/types'
import Button from '../common/Button'

interface ReviewChangesModalProps {
    isOpen: boolean
    onClose: () => void
    diffs: PendingDiff[]
    onAcceptDiff: (diffId: string) => void
    onRejectDiff: (diffId: string) => void
    onApplyAll: () => void
}

export default function ReviewChangesModal({
    isOpen,
    onClose,
    diffs,
    onAcceptDiff,
    onRejectDiff,
    onApplyAll
}: ReviewChangesModalProps) {
    const [acceptedDiffs, setAcceptedDiffs] = useState<Set<string>>(new Set())
    const [rejectedDiffs, setRejectedDiffs] = useState<Set<string>>(new Set())

    // Debug: Log diffs when modal opens
    if (isOpen && diffs.length > 0) {
        console.log('ReviewChangesModal diffs:', diffs)
    }

    if (!isOpen) return null

    const handleAccept = (diffId: string) => {
        setAcceptedDiffs(prev => new Set(prev).add(diffId))
        setRejectedDiffs(prev => {
            const next = new Set(prev)
            next.delete(diffId)
            return next
        })
        onAcceptDiff(diffId)
    }

    const handleReject = (diffId: string) => {
        setRejectedDiffs(prev => new Set(prev).add(diffId))
        setAcceptedDiffs(prev => {
            const next = new Set(prev)
            next.delete(diffId)
            return next
        })
        onRejectDiff(diffId)
    }

    const handleApplyAll = () => {
        // Accept all non-rejected diffs
        diffs.forEach(diff => {
            if (!rejectedDiffs.has(diff.id)) {
                onAcceptDiff(diff.id)
            }
        })
        onApplyAll()
        onClose()
    }

    const getDiffTypeLabel = (type: string) => {
        switch (type) {
            case 'update': return 'UPDATE'
            case 'insert': return 'INSERT'
            case 'delete': return 'DELETE'
            default: return type.toUpperCase()
        }
    }

    const getDiffTypeClass = (type: string) => {
        switch (type) {
            case 'update': return 'diff-update'
            case 'insert': return 'diff-insert'
            case 'delete': return 'diff-delete'
            default: return ''
        }
    }

    return (
        <>
            <div className="modal-backdrop" onClick={onClose} />
            <div className="review-modal">
                <div className="review-modal-header">
                    <h3>Review Changes</h3>
                    <button className="modal-close-btn" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="review-modal-content">
                    {diffs.length === 0 ? (
                        <div className="no-changes">No pending changes</div>
                    ) : (
                        diffs.map((diff) => {
                            const isAccepted = acceptedDiffs.has(diff.id)
                            const isRejected = rejectedDiffs.has(diff.id)

                            return (
                                <div
                                    key={diff.id}
                                    className={`diff-item ${getDiffTypeClass(diff.type)} ${isAccepted ? 'accepted' : ''
                                        } ${isRejected ? 'rejected' : ''}`}
                                >
                                    <div className="diff-item-header">
                                        <span className="diff-type-badge">{getDiffTypeLabel(diff.type)}</span>
                                        <div className="diff-item-actions">
                                            {!isAccepted && !isRejected && (
                                                <>
                                                    <button
                                                        className="diff-action-btn accept"
                                                        onClick={() => handleAccept(diff.id)}
                                                        title="Accept change"
                                                    >
                                                        <Check size={14} />
                                                        Accept
                                                    </button>
                                                    <button
                                                        className="diff-action-btn reject"
                                                        onClick={() => handleReject(diff.id)}
                                                        title="Reject change"
                                                    >
                                                        <X size={14} />
                                                        Reject
                                                    </button>
                                                </>
                                            )}
                                            {isAccepted && <span className="status-badge accepted">✓ Accepted</span>}
                                            {isRejected && <span className="status-badge rejected">✗ Rejected</span>}
                                        </div>
                                    </div>

                                    <div className="diff-item-content">
                                        {diff.type === 'update' && (
                                            <>
                                                {diff.oldContent && (
                                                    <div className="diff-old">
                                                        <div className="diff-label">- Old</div>
                                                        <pre>{diff.oldContent}</pre>
                                                    </div>
                                                )}
                                                {diff.newContent && (
                                                    <div className="diff-new">
                                                        <div className="diff-label">+ New</div>
                                                        <pre>{diff.newContent}</pre>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {diff.type === 'insert' && diff.newContent && (
                                            <div className="diff-new">
                                                <div className="diff-label">+ Insert</div>
                                                <pre>{diff.newContent}</pre>
                                            </div>
                                        )}
                                        {diff.type === 'delete' && diff.oldContent && (
                                            <div className="diff-old">
                                                <div className="diff-label">- Delete</div>
                                                <pre>{diff.oldContent}</pre>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                <div className="review-modal-footer">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleApplyAll} disabled={diffs.length === 0}>
                        Apply Changes ({acceptedDiffs.size > 0 ? acceptedDiffs.size : diffs.filter(d => !rejectedDiffs.has(d.id)).length})
                    </Button>
                </div>
            </div>
        </>
    )
}
