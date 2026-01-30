import { useState } from 'react'
import { Check, X, FileText, FolderPlus, FilePlus, Trash2, AlertCircle } from 'lucide-react'
import { useDiffStore, type FileDiffSummary } from '../../stores/diffStore'
import Button from '../common/Button'

interface CompactDiffCardProps {
    fileSummaries: FileDiffSummary[]
    onFileClick: (filePath: string) => void
    onApplyFile: (filePath: string) => void
    onRejectFile: (filePath: string) => void
    onApplyAll: () => void
    onRejectAll: () => void
    isApplied?: boolean
    onUndo?: () => void
}

export default function CompactDiffCard({
    fileSummaries,
    onFileClick,
    onApplyFile,
    onRejectFile,
    onApplyAll,
    onRejectAll,
    isApplied = false,
    onUndo
}: CompactDiffCardProps) {
    // Safety check
    if (!fileSummaries || fileSummaries.length === 0) {
        return null
    }

    const fileCount = fileSummaries.length
    const createdCount = fileSummaries.filter(f => f.status === 'created').length
    const deletedCount = fileSummaries.filter(f => f.status === 'deleted').length
    const errorCount = fileSummaries.filter(f => f.status === 'error').length

    return (
        <div className="compact-diff-card">
            {/* Header */}
            <div className="compact-diff-header">
                <span className="compact-diff-title">
                    Changes ({fileCount} file{fileCount !== 1 ? 's' : ''}
                    {createdCount > 0 && `, ${createdCount} created`}
                    {deletedCount > 0 && `, ${deletedCount} deleted`}
                    {errorCount > 0 && `, ${errorCount} error${errorCount !== 1 ? 's' : ''}`})
                </span>
            </div>

            {/* Divider */}
            <div className="compact-diff-divider" />

            {/* File List */}
            <div className="compact-diff-list">
                {fileSummaries.map((summary) => (
                    <div key={summary.filePath} className="compact-diff-item">
                        {/* Status Icon */}
                        <span className="compact-diff-icon">
                            {summary.status === 'created' && <FilePlus size={12} style={{ color: 'var(--color-success)' }} />}
                            {summary.status === 'deleted' && <Trash2 size={12} style={{ color: 'var(--color-danger)' }} />}
                            {summary.status === 'error' && <AlertCircle size={12} style={{ color: 'var(--color-warning)' }} />}
                            {summary.status === 'modified' && <FileText size={12} style={{ opacity: 0.5 }} />}
                        </span>

                        {/* File Name (Clickable) */}
                        <button
                            className="compact-diff-filename"
                            onClick={() => onFileClick(summary.filePath)}
                            title={summary.filePath}
                        >
                            {summary.fileName}
                        </button>

                        {/* Diff Stats */}
                        {summary.status === 'modified' && (
                            <span className="compact-diff-stats">
                                {summary.deletions > 0 && (
                                    <span className="diff-deletions">-{summary.deletions}</span>
                                )}
                                {summary.additions > 0 && (
                                    <span className="diff-additions">+{summary.additions}</span>
                                )}
                            </span>
                        )}

                        {/* Status Label */}
                        {summary.status === 'created' && (
                            <span className="compact-diff-label" style={{ color: 'var(--color-success)' }}>
                                Created
                            </span>
                        )}
                        {summary.status === 'deleted' && (
                            <span className="compact-diff-label" style={{ color: 'var(--color-danger)' }}>
                                Deleted
                            </span>
                        )}
                        {summary.status === 'error' && (
                            <span className="compact-diff-label" style={{ color: 'var(--color-warning)' }}>
                                Error
                            </span>
                        )}

                        {/* Error Message */}
                        {summary.status === 'error' && summary.errorMessage && (
                            <span className="compact-diff-error" title={summary.errorMessage}>
                                {summary.errorMessage}
                            </span>
                        )}

                        {/* Actions */}
                        {!isApplied && summary.status !== 'error' && (
                            <button
                                className="compact-diff-action"
                                onClick={() => onApplyFile(summary.filePath)}
                                title="Apply changes"
                            >
                                Apply
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Footer Actions */}
            <div className="compact-diff-footer">
                {isApplied && onUndo ? (
                    <Button variant="default" onClick={onUndo} style={{ width: '100%' }}>
                        ↩ Undo
                    </Button>
                ) : (
                    <>
                        <Button variant="default" onClick={onRejectAll} style={{ flex: 1 }}>
                            Reject All
                        </Button>
                        <Button variant="primary" onClick={onApplyAll} style={{ flex: 1 }}>
                            <Check size={12} /> Apply All
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}
