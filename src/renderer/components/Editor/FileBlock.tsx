import { useState, lazy, Suspense } from 'react'
import { FileText, File, ExternalLink } from 'lucide-react'
import { useVaultStore } from '../../stores/vaultStore'

// Lazy load react-pdf to avoid loading it for non-PDF files
const PDFViewer = lazy(() => import('./PDFViewer'))

interface FileBlockProps {
    src: string
    viewMode: 'edit' | 'preview'
}

// Get file extension from path
function getFileExtension(filePath: string): string {
    const parts = filePath.split('.')
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

// Get file name from path
function getFileName(filePath: string): string {
    const parts = filePath.split('/')
    return parts[parts.length - 1] || filePath
}

// Get file icon based on extension
function getFileIcon(extension: string) {
    switch (extension) {
        case 'pdf':
            return <FileText size={24} />
        default:
            return <File size={24} />
    }
}

export default function FileBlock({ src, viewMode }: FileBlockProps) {
    const { vaultPath } = useVaultStore()
    const extension = getFileExtension(src)
    const fileName = getFileName(src)
    const isPdf = extension === 'pdf'

    // Resolve file source - handle relative paths, full paths, and URLs
    let fileSrc = src

    if (src.startsWith('http://') || src.startsWith('https://')) {
        // Remote URL - use as is
        fileSrc = src
    } else if (src.startsWith('/')) {
        // Full path - convert to media:// protocol
        fileSrc = `media://${src}`
    } else if (src.startsWith('file://')) {
        // file:// protocol - convert to media://
        fileSrc = src.replace('file://', 'media://')
    } else {
        // Relative path (just filename) - resolve against vault path
        // The file could be in vault root or in a subdirectory
        // For now, assume it's in the vault root
        if (vaultPath) {
            fileSrc = `media://${vaultPath}/${src}`
        } else {
            fileSrc = `media://${src}`
        }
    }

    // PDF files get the full viewer
    if (isPdf) {
        return (
            <Suspense fallback={
                <div className="file-block file-block-loading">
                    <FileText size={24} />
                    <span>Loading PDF viewer...</span>
                </div>
            }>
                <PDFViewer src={fileSrc} />
            </Suspense>
        )
    }

    // Other files get a simple file block with icon and name
    return (
        <div className="file-block file-block-generic">
            <div className="file-block-icon">
                {getFileIcon(extension)}
            </div>
            <div className="file-block-info">
                <span className="file-block-name">{fileName}</span>
                <span className="file-block-extension">.{extension || 'file'}</span>
            </div>
            <a
                href={fileSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="file-block-open"
                title="Open file"
            >
                <ExternalLink size={16} />
            </a>
        </div>
    )
}
