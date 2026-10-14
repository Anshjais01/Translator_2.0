import { useState, useCallback, useRef, useEffect } from 'react'
import './App.css'

const GOOGLE_TRANSLATE_API =
  'https://translate.googleapis.com/translate_a/single'

/**
 * Translate English text to Hindi using Google Translate
 */
async function translateText(text) {
  if (!text.trim()) return ''

  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: 'hi',
    dt: 't',
    q: text.trim(),
  })

  const response = await fetch(`${GOOGLE_TRANSLATE_API}?${params}`)

  if (!response.ok) {
    throw new Error('Translation request failed. Please try again.')
  }

  const data = await response.json()

  // Google returns nested arrays: [[["translated","original",...],...],...]
  // Combine all translated segments
  const translated = data[0]
    .map((segment) => segment[0])
    .filter(Boolean)
    .join('')

  if (!translated) {
    throw new Error('No translation returned. Please try again.')
  }

  return translated
}

function App() {
  const [sourceText, setSourceText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('translator-history')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [toast, setToast] = useState('')
  const textareaRef = useRef(null)

  // Persist history
  useEffect(() => {
    localStorage.setItem('translator-history', JSON.stringify(history))
  }, [history])

  // Show toast notification
  const showToast = useCallback((message) => {
    setToast(message)
    setTimeout(() => setToast(''), 2000)
  }, [])

  // Handle translation
  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim() || isLoading) return

    setIsLoading(true)
    setError('')
    setTranslatedText('')

    try {
      const result = await translateText(sourceText)
      setTranslatedText(result)

      // Add to history (avoid duplicates, keep last 10)
      setHistory((prev) => {
        const filtered = prev.filter(
          (item) => item.source.toLowerCase() !== sourceText.trim().toLowerCase()
        )
        return [
          { source: sourceText.trim(), target: result, timestamp: Date.now() },
          ...filtered,
        ].slice(0, 10)
      })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [sourceText, isLoading])

  // Keyboard shortcut: Ctrl+Enter to translate
  const handleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleTranslate()
      }
    },
    [handleTranslate]
  )

  // Copy translated text
  const handleCopy = useCallback(() => {
    if (!translatedText) return
    navigator.clipboard.writeText(translatedText).then(() => {
      showToast('Copied to clipboard')
    })
  }, [translatedText, showToast])

  // Clear source text
  const handleClear = useCallback(() => {
    setSourceText('')
    setTranslatedText('')
    setError('')
    textareaRef.current?.focus()
  }, [])

  // Load from history
  const handleHistoryClick = useCallback((item) => {
    setSourceText(item.source)
    setTranslatedText(item.target)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Clear history
  const handleClearHistory = useCallback(() => {
    setHistory([])
    showToast('History cleared')
  }, [showToast])

  const charCount = sourceText.length

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header__brand">
          <div className="header__icon">🔤</div>
          <div>
            <div className="header__title">Translator</div>
            <div className="header__subtitle">English → Hindi</div>
          </div>
        </div>
        <div className="header__badge">
          <span className="header__badge-dot"></span>
          Ready
        </div>
      </header>

      {/* Main */}
      <main className="main">
        <div className="translator">
          {/* Heading */}
          <div className="translator__heading">
            <h1>Translate English to Hindi</h1>
            <p>Type or paste your text and get instant translation</p>
          </div>

          {/* Panels */}
          <div className="translator__panels">
            {/* Source Panel */}
            <div className="panel panel--source">
              <div className="panel__header">
                <div className="panel__lang">
                  <span className="panel__lang-flag">🇬🇧</span>
                  <span className="panel__lang-name">English</span>
                </div>
                <span className="panel__char-count">
                  {charCount > 0 ? `${charCount} chars` : ''}
                </span>
              </div>

              <div className="panel__body">
                <textarea
                  ref={textareaRef}
                  className="panel__textarea"
                  id="source-text"
                  placeholder="Type something in English…"
                  value={sourceText}
                  onChange={(e) => {
                    setSourceText(e.target.value)
                    setError('')
                  }}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
              </div>

              <div className="panel__footer">
                <div className="panel__actions">
                  {sourceText && (
                    <button
                      className="icon-btn"
                      onClick={handleClear}
                      title="Clear text"
                      aria-label="Clear text"
                      id="clear-btn"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  className="translate-btn"
                  onClick={handleTranslate}
                  disabled={!sourceText.trim() || isLoading}
                  id="translate-btn"
                >
                  {isLoading ? 'Translating…' : 'Translate'}
                  <span className="translate-btn__icon">→</span>
                </button>
              </div>
            </div>

            {/* Target Panel */}
            <div className="panel panel--target">
              <div className="panel__header">
                <div className="panel__lang">
                  <span className="panel__lang-flag">🇮🇳</span>
                  <span className="panel__lang-name">Hindi</span>
                </div>
              </div>

              <div className="panel__body">
                {isLoading ? (
                  <div className="panel__output panel__output--loading">
                    <div className="spinner"></div>
                    <span>Translating…</span>
                  </div>
                ) : error ? (
                  <div className="panel__output">
                    <div className="error-msg">
                      <span className="error-msg__icon">⚠</span>
                      {error}
                    </div>
                  </div>
                ) : translatedText ? (
                  <div className="panel__output" id="translated-output">
                    {translatedText}
                  </div>
                ) : (
                  <div className="panel__output panel__output--empty">
                    Translation will appear here…
                  </div>
                )}
              </div>

              {translatedText && !isLoading && (
                <div className="panel__footer">
                  <div></div>
                  <div className="panel__actions">
                    <button
                      className="icon-btn"
                      onClick={handleCopy}
                      title="Copy translation"
                      aria-label="Copy translation"
                      id="copy-btn"
                    >
                      📋
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Keyboard hint */}
          <div
            style={{
              textAlign: 'center',
              marginTop: '12px',
              fontSize: '0.75rem',
              color: 'var(--text-tertiary)',
            }}
          >
            Press <kbd style={{
              padding: '2px 6px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-light)',
              borderRadius: '4px',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font)',
            }}>Ctrl</kbd> + <kbd style={{
              padding: '2px 6px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-light)',
              borderRadius: '4px',
              fontSize: '0.6875rem',
              fontFamily: 'var(--font)',
            }}>Enter</kbd> to translate
          </div>

          {/* History */}
          {history.length > 0 && (
            <section className="history">
              <div className="history__header">
                <span className="history__title">Recent Translations</span>
                <button
                  className="history__clear-btn"
                  onClick={handleClearHistory}
                  id="clear-history-btn"
                >
                  Clear all
                </button>
              </div>
              <div className="history__list">
                {history.map((item) => (
                  <div
                    key={item.timestamp}
                    className="history__item"
                    onClick={() => handleHistoryClick(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleHistoryClick(item)
                    }}
                  >
                    <span className="history__item-text">
                      {item.source}
                    </span>
                    <span className="history__item-arrow">→</span>
                    <span className="history__item-text history__item-text--hindi">
                      {item.target}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p className="footer__text">
          Powered by Google Translate • English to Hindi
        </p>
      </footer>

      {/* Toast */}
      <div className={`toast ${toast ? 'toast--visible' : ''}`}>{toast}</div>
    </div>
  )
}

export default App
