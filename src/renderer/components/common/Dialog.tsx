import React from 'react'
import Modal, { ModalProps } from './Modal'

interface DialogProps extends Omit<ModalProps, 'children' | 'footer' | 'title'> {
    title: string
    message: React.ReactNode
    confirmLabel?: string
    cancelLabel?: string
    onConfirm: () => void
    variant?: 'info' | 'danger' | 'warning' | 'success'
}

export default function Dialog({
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onClose,
    variant = 'info',
    ...modalProps
}: DialogProps) {

    const getConfirmButtonClass = () => {
        switch (variant) {
            case 'danger': return 'btn-danger'
            case 'success': return 'btn-success'
            case 'warning': return 'btn-warning'
            default: return 'btn-primary'
        }
    }

    const footer = (
        <>
            <button className="btn btn-secondary" onClick={onClose}>
                {cancelLabel}
            </button>
            <button
                className={`btn ${getConfirmButtonClass()}`}
                onClick={() => {
                    onConfirm()
                    onClose() // Auto close on confirm? Usually yes, but sometimes we might want to wait. 
                    // For simple Dialog, auto-close is expected.
                }}
            >
                {confirmLabel}
            </button>
        </>
    )

    return (
        <Modal
            {...modalProps}
            onClose={onClose}
            title={title}
            footer={footer}
            width="400px"
        >
            <div className="dialog-message" style={{ lineHeight: '1.5', color: 'var(--color-text-secondary)' }}>
                {message}
            </div>
        </Modal>
    )
}
