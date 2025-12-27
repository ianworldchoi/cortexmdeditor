import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, Globe } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'

interface BrowserTabProps {
    tabId: string
    initialUrl: string
    isResizing?: boolean
}

export default function BrowserTab({ tabId, initialUrl, isResizing }: BrowserTabProps) {
    const { updateBrowserUrl } = useEditorStore()
    const [url, setUrl] = useState(initialUrl)
    const [inputUrl, setInputUrl] = useState(initialUrl)
    const [isLoading, setIsLoading] = useState(true)
    const [canGoBack, setCanGoBack] = useState(false)
    const [canGoForward, setCanGoForward] = useState(false)
    const webviewRef = useRef<Electron.WebviewTag | null>(null)

    useEffect(() => {
        const webview = webviewRef.current
        if (!webview) return

        const handleDidStartLoading = () => setIsLoading(true)
        const handleDidStopLoading = () => setIsLoading(false)

        const handleDidNavigate = (e: Electron.DidNavigateEvent) => {
            setUrl(e.url)
            setInputUrl(e.url)
            updateBrowserUrl(tabId, e.url, getPageTitle())
            updateNavigationState()
        }

        const handleDidNavigateInPage = (e: Electron.DidNavigateInPageEvent) => {
            setUrl(e.url)
            setInputUrl(e.url)
            updateNavigationState()
        }

        const handlePageTitleUpdated = (e: Electron.PageTitleUpdatedEvent) => {
            updateBrowserUrl(tabId, url, e.title)
        }

        const getPageTitle = () => {
            try {
                return webview.getTitle() || 'New Tab'
            } catch {
                return 'New Tab'
            }
        }

        const updateNavigationState = () => {
            try {
                setCanGoBack(webview.canGoBack())
                setCanGoForward(webview.canGoForward())
            } catch {
                // Webview not ready
            }
        }

        webview.addEventListener('did-start-loading', handleDidStartLoading)
        webview.addEventListener('did-stop-loading', handleDidStopLoading)
        webview.addEventListener('did-navigate', handleDidNavigate as EventListener)
        webview.addEventListener('did-navigate-in-page', handleDidNavigateInPage as EventListener)
        webview.addEventListener('page-title-updated', handlePageTitleUpdated as EventListener)

        return () => {
            webview.removeEventListener('did-start-loading', handleDidStartLoading)
            webview.removeEventListener('did-stop-loading', handleDidStopLoading)
            webview.removeEventListener('did-navigate', handleDidNavigate as EventListener)
            webview.removeEventListener('did-navigate-in-page', handleDidNavigateInPage as EventListener)
            webview.removeEventListener('page-title-updated', handlePageTitleUpdated as EventListener)
        }
    }, [tabId, url, updateBrowserUrl])

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        let targetUrl = inputUrl.trim()

        // Add protocol if missing
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            // Check if it looks like a URL
            if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
                targetUrl = 'https://' + targetUrl
            } else {
                // Treat as search query
                targetUrl = `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}`
            }
        }

        setUrl(targetUrl)
        if (webviewRef.current) {
            webviewRef.current.src = targetUrl
        }
    }

    const handleGoBack = () => {
        webviewRef.current?.goBack()
    }

    const handleGoForward = () => {
        webviewRef.current?.goForward()
    }

    const handleReload = () => {
        webviewRef.current?.reload()
    }

    return (
        <div className="browser-tab">
            <div className="browser-toolbar">
                <div className="browser-nav-buttons">
                    <button
                        className="browser-nav-btn"
                        onClick={handleGoBack}
                        disabled={!canGoBack}
                        title="Back"
                    >
                        <ArrowLeft size={14} />
                    </button>
                    <button
                        className="browser-nav-btn"
                        onClick={handleGoForward}
                        disabled={!canGoForward}
                        title="Forward"
                    >
                        <ArrowRight size={14} />
                    </button>
                    <button
                        className="browser-nav-btn"
                        onClick={handleReload}
                        title="Reload"
                    >
                        <RotateCw size={14} className={isLoading ? 'spinning' : ''} />
                    </button>
                </div>

                <form className="browser-url-form" onSubmit={handleUrlSubmit}>
                    <div className="browser-url-input-wrapper">
                        <Globe size={14} className="browser-url-icon" />
                        <input
                            type="text"
                            className="browser-url-input"
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            placeholder="Search or enter URL"
                        />
                    </div>
                </form>
            </div>

            <div className="browser-webview-wrapper">
                <webview
                    ref={webviewRef as React.RefObject<Electron.WebviewTag>}
                    src={url}
                    className="browser-webview"
                    // @ts-expect-error - webview attributes
                    allowpopups=""
                />
                {/* Overlay to prevent webview from capturing mouse during resize */}
                {isResizing && <div className="browser-resize-overlay" />}
            </div>
        </div>
    )
}
