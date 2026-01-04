import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import Squircle from './Squircle'

export interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title?: React.ReactNode
    children: React.ReactNode
    footer?: React.ReactNode
    width?: string
    className?: string
    closeOnOverlayClick?: boolean
    showCloseButton?: boolean
}

export default function Modal({
    isOpen,
    onClose,
    title,
    children,
    footer,
    width = '500px',
    className = '',
    closeOnOverlayClick = true,
    showCloseButton = true
}: ModalProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose()
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown)
            document.body.style.overflow = 'hidden' // Prevent background scrolling
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.body.style.overflow = ''
        }
    }, [isOpen, onClose])

    if (!isOpen) return null

    return (
        <div
            className="modal-overlay"
            onClick={closeOnOverlayClick ? onClose : undefined}
            role="dialog"
            aria-modal="true"
        >
            <Squircle
                className={`modal ${className}`}
                onClick={e => e.stopPropagation()}
                style={{
                    width,
                    maxWidth: '90vw',
                    boxShadow: 'none', // Disable box-shadow as it gets clipped
                    filter: 'drop-shadow(var(--shadow-xl))' // Use drop-shadow instead
                }}
                cornerRadius="var(--radius-xl)" // Standardized
                cornerSmoothing={1}
            >
                {(title || showCloseButton) && (
                    <div className="modal-header">
                        {title && <h2 className="modal-title">{title}</h2>}
                        {showCloseButton && (
                            <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
                                <X size={18} />
                            </button>
                        )}
                    </div>
                )}

                <div className="modal-body">
                    {children}
                </div>

                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </Squircle>
        </div>
    )
}
