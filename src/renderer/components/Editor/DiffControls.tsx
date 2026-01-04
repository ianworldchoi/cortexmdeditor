import { Check, X } from 'lucide-react'
import type { PendingDiff } from '@shared/types'

interface DiffControlsProps {
    diff: PendingDiff
    onAccept: () => void
    onReject: () => void
}

export default function DiffControls({ diff, onAccept, onReject }: DiffControlsProps) {
    return (
        <div className="diff-controls">
            <button
                className="diff-accept-btn"
                onClick={(e) => {
                    e.stopPropagation()
                    onAccept()
                }}
                title="Accept change"
            >
                <Check size={14} />
                Accept
            </button>
            <button
                className="diff-reject-btn"
                onClick={(e) => {
                    e.stopPropagation()
                    onReject()
                }}
                title="Reject change"
            >
                <X size={14} />
                Reject
            </button>
        </div>
    )
}
