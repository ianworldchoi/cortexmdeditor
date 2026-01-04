import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'

// PDF.js worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PDFViewerProps {
    src: string
}

export default function PDFViewer({ src }: PDFViewerProps) {
    const [numPages, setNumPages] = useState<number>(0)
    const [pageNumber, setPageNumber] = useState(1)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
        setNumPages(numPages)
        setLoading(false)
        setError(null)
    }

    function onDocumentLoadError(error: Error) {
        setError(error.message)
        setLoading(false)
    }

    return (
        <div className="pdf-block">
            {loading && (
                <div className="pdf-loading">
                    <FileText size={32} />
                    <span>Loading PDF...</span>
                </div>
            )}
            {error && (
                <div className="pdf-error">
                    <FileText size={32} />
                    <span>Failed to load PDF: {error}</span>
                </div>
            )}
            <Document
                file={src}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading=""
            >
                <Page
                    pageNumber={pageNumber}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                />
            </Document>
            {numPages > 0 && (
                <div className="pdf-navigation">
                    <button
                        onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                        disabled={pageNumber <= 1}
                        title="Previous page"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="pdf-page-info">
                        {pageNumber} / {numPages}
                    </span>
                    <button
                        onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                        disabled={pageNumber >= numPages}
                        title="Next page"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}
