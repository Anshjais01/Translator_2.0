import { useState, useCallback, useRef, useEffect } from 'react'
import './App.css'

const GOOGLE_TRANSLATE_API =
  'https://translate.googleapis.com/translate_a/single'

// Check browser support for Speech APIs
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition
const speechSynthesis = window.speechSynthesis

// Language configs
const LANGUAGES = {
  en: { code: 'en', name: 'English', flag: '🇬🇧', speechLang: 'en-US' },
  hi: { code: 'hi', name: 'Hindi', flag: '🇮🇳', speechLang: 'hi-IN' },
}

/**
 * Translate text between English and Hindi using Google Translate
 */
async function translateText(text, sourceLang, targetLang) {
  if (!text.trim()) return ''

  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLang,
    tl: targetLang,
    dt: 't',
    q: text.trim(),
  })

  const response = await fetch(`${GOOGLE_TRANSLATE_API}?${params}`)

  if (!response.ok) {
    throw new Error('Translation request failed. Please try again.')
  }

  const data = await response.json()

  // Google returns nested arrays: [[["translated","original",...],...],...]
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
  const [direction, setDirection] = useState('en-hi') // 'en-hi' or 'hi-en'
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
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSwapping, setIsSwapping] = useState(false)
  const textareaRef = useRef(null)
  const recognitionRef = useRef(null)

  // Derive source/target language from direction
  const sourceLang = direction === 'en-hi' ? LANGUAGES.en : LANGUAGES.hi
  const targetLang = direction === 'en-hi' ? LANGUAGES.hi : LANGUAGES.en

  // Persist history
  useEffect(() => {
    localStorage.setItem('translator-history', JSON.stringify(history))
  }, [history])

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
      speechSynthesis?.cancel()
    }
  }, [])

  // Show toast notification
  const showToast = useCallback((message) => {
    setToast(message)
    setTimeout(() => setToast(''), 2000)
  }, [])

  // ===== Swap direction =====
  const handleSwap = useCallback(() => {
    // Stop any active speech
    if (isListening) {
      recognitionRef.current?.stop()
      clearTimeout(recognitionRef.current?._autoStopTimer)
      setIsListening(false)
    }
    if (isSpeaking) {
      speechSynthesis?.cancel()
      setIsSpeaking(false)
    }

    setIsSwapping(true)
    setTimeout(() => setIsSwapping(false), 400)

    // Swap text: translated becomes source
    const prevTranslated = translatedText
    setDirection((d) => (d === 'en-hi' ? 'hi-en' : 'en-hi'))
    setSourceText(prevTranslated)
    setTranslatedText('')
    setError('')
  }, [translatedText, isListening, isSpeaking])

  // Handle translation
  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim() || isLoading) return

    setIsLoading(true)
    setError('')
    setTranslatedText('')

    try {
      const result = await translateText(
        sourceText,
        sourceLang.code,
        targetLang.code
      )
      setTranslatedText(result)

      // Add to history (avoid duplicates, keep last 10)
      setHistory((prev) => {
        const filtered = prev.filter(
          (item) => item.source.toLowerCase() !== sourceText.trim().toLowerCase()
        )
        return [
          {
            source: sourceText.trim(),
            target: result,
            direction,
            timestamp: Date.now(),
          },
          ...filtered,
        ].slice(0, 10)
      })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [sourceText, isLoading, sourceLang.code, targetLang.code, direction])

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

  // ===== Speech Recognition (Mic → source text) =====
  const handleMicToggle = useCallback(() => {
    if (!SpeechRecognition) {
      showToast('Speech recognition not supported in this browser')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      clearTimeout(recognitionRef.current?._autoStopTimer)
      setIsListening(false)
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = sourceLang.speechLang
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    let finalTranscript = sourceText

    recognition.onstart = () => {
      setIsListening(true)
      showToast(`🎤 Listening in ${sourceLang.name}… (7s)`)

      recognition._autoStopTimer = setTimeout(() => {
        recognition.stop()
      }, 7000)
    }

    recognition.onresult = (event) => {
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? ' ' : '') + transcript
        } else {
          interimTranscript += transcript
        }
      }

      setSourceText(
        finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')
      )
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      clearTimeout(recognition._autoStopTimer)
      setIsListening(false)
      if (event.error === 'not-allowed') {
        showToast('Microphone permission denied')
      } else if (event.error !== 'aborted') {
        showToast('Speech recognition error')
      }
    }

    recognition.onend = () => {
      clearTimeout(recognition._autoStopTimer)
      setIsListening(false)
    }

    recognition.start()
  }, [isListening, sourceText, sourceLang, showToast])

  // ===== Text-to-Speech (Speak translated text) =====
  const handleSpeak = useCallback(() => {
    if (!translatedText || !speechSynthesis) {
      if (!speechSynthesis) showToast('Text-to-speech not supported')
      return
    }

    if (isSpeaking) {
      speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(translatedText)
    utterance.lang = targetLang.speechLang
    utterance.rate = 0.9
    utterance.pitch = 1

    const voices = speechSynthesis.getVoices()
    const matchedVoice = voices.find(
      (v) =>
        v.lang === targetLang.speechLang ||
        v.lang.startsWith(targetLang.code)
    )
    if (matchedVoice) utterance.voice = matchedVoice

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => {
      setIsSpeaking(false)
      showToast('Could not play audio')
    }

    speechSynthesis.speak(utterance)
  }, [translatedText, isSpeaking, targetLang, showToast])

  // Speak source text
  const handleSpeakSource = useCallback(() => {
    if (!sourceText || !speechSynthesis) return

    if (isSpeaking) {
      speechSynthesis.cancel()
      setIsSpeaking(false)
      return
    }

    speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(sourceText)
    utterance.lang = sourceLang.speechLang
    utterance.rate = 0.9

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    speechSynthesis.speak(utterance)
  }, [sourceText, isSpeaking, sourceLang])

  // Load from history
  const handleHistoryClick = useCallback((item) => {
    setSourceText(item.source)
    setTranslatedText(item.target)
    if (item.direction) setDirection(item.direction)
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
            <div className="header__subtitle">
              {sourceLang.name} ↔ {targetLang.name}
            </div>
          </div>
        </div>
        <div className="header__badge">
          <span
            className={`header__badge-dot ${isListening ? 'header__badge-dot--active' : ''}`}
          ></span>
          {isListening ? 'Listening…' : 'Ready'}
        </div>
      </header>

      {/* Main */}
      <main className="main">
        <div className="translator">
          {/* Heading */}
          <div className="translator__heading">
            <h1>
              Translate {sourceLang.name} to {targetLang.name}
            </h1>
            <p>Type, paste, or speak your text and get instant translation</p>
          </div>

          {/* Swap Button */}
          <div className="swap-container">
            <button
              className={`swap-btn ${isSwapping ? 'swap-btn--active' : ''}`}
              onClick={handleSwap}
              title="Swap languages"
              aria-label="Swap languages"
              id="swap-btn"
            >
              <span className="swap-btn__icon">⇄</span>
              <span className="swap-btn__label">
                {sourceLang.flag} {sourceLang.name} → {targetLang.flag}{' '}
                {targetLang.name}
              </span>
            </button>
          </div>

          {/* Panels */}
          <div className="translator__panels">
            {/* Source Panel */}
            <div className="panel panel--source">
              <div className="panel__header">
                <div className="panel__lang">
                  <span className="panel__lang-flag">{sourceLang.flag}</span>
                  <span className="panel__lang-name">{sourceLang.name}</span>
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
                  placeholder={`Type something in ${sourceLang.name}…`}
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
                  {/* Mic Button */}
                  <button
                    className={`icon-btn ${isListening ? 'icon-btn--listening' : ''}`}
                    onClick={handleMicToggle}
                    title={
                      isListening
                        ? 'Stop listening'
                        : `Speak in ${sourceLang.name}`
                    }
                    aria-label={
                      isListening
                        ? 'Stop listening'
                        : `Speak in ${sourceLang.name}`
                    }
                    id="mic-btn"
                  >
                    {isListening ? (
                      <span className="mic-pulse">🎤</span>
                    ) : (
                      '🎤'
                    )}
                  </button>

                  {/* Speak source */}
                  {sourceText && (
                    <button
                      className="icon-btn"
                      onClick={handleSpeakSource}
                      title={`Listen in ${sourceLang.name}`}
                      aria-label={`Listen to ${sourceLang.name} text`}
                      id="speak-source-btn"
                    >
                      🔊
                    </button>
                  )}

                  {/* Clear */}
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
                  <span className="panel__lang-flag">{targetLang.flag}</span>
                  <span className="panel__lang-name">{targetLang.name}</span>
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
                    {/* Speak translation */}
                    <button
                      className={`icon-btn ${isSpeaking ? 'icon-btn--speaking' : ''}`}
                      onClick={handleSpeak}
                      title={
                        isSpeaking
                          ? 'Stop speaking'
                          : `Listen in ${targetLang.name}`
                      }
                      aria-label={
                        isSpeaking
                          ? 'Stop speaking'
                          : `Listen to ${targetLang.name} translation`
                      }
                      id="speak-btn"
                    >
                      {isSpeaking ? '⏹️' : '🔊'}
                    </button>

                    {/* Copy */}
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
            Press{' '}
            <kbd
              style={{
                padding: '2px 6px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-light)',
                borderRadius: '4px',
                fontSize: '0.6875rem',
                fontFamily: 'var(--font)',
              }}
            >
              Ctrl
            </kbd>{' '}
            +{' '}
            <kbd
              style={{
                padding: '2px 6px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-light)',
                borderRadius: '4px',
                fontSize: '0.6875rem',
                fontFamily: 'var(--font)',
              }}
            >
              Enter
            </kbd>{' '}
            to translate &nbsp;•&nbsp; 🎤 to speak &nbsp;•&nbsp; ⇄ to swap
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
                    <span className="history__item-text">{item.source}</span>
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
          Powered by Google Translate • {sourceLang.name} ↔ {targetLang.name}
        </p>
      </footer>

      {/* Toast */}
      <div className={`toast ${toast ? 'toast--visible' : ''}`}>{toast}</div>
    </div>
  )
}

export default App
