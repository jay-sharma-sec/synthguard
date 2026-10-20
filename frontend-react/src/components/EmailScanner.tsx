import { useState } from 'react'
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Shield,
  ChevronRight,
} from 'lucide-react'
import { SynthGuardAPI, type AnalysisResponse } from '../api/client'

export function EmailScanner() {
  const [emailText, setEmailText] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleScan = async () => {
    if (!emailText.trim()) {
      setError('Please provide an email payload before running analysis.')
      return
    }
    setIsAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const res = await SynthGuardAPI.analyzeEmail(emailText)
      setResult(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed'
      setError(msg)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const isPhish = result?.prediction.label.toLowerCase() === 'phishing'

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Email Intelligence</h1>
          <p className="page-subtitle">
            Examine suspicious email payloads for phishing indicators, BEC coercion, and social engineering patterns.
          </p>
        </div>
        <div className="heading-status">
          <span /> LOCAL DISTILBERT MODEL
        </div>
      </div>

      <div className="module-workspace panel">
        <div className="module-workspace-heading">
          <div className="large-module-icon">
            <ShieldAlert size={25} />
          </div>
          <div>
            <h2>Email Forensic Workspace</h2>
            <p>Local text analysis powered by the SynthGuard DistilBERT model.</p>
          </div>
        </div>

        <div className="analysis-form">
          <label htmlFor="email-content">EMAIL PAYLOAD</label>
          <textarea
            id="email-content"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            placeholder="Paste suspicious communication text here (headers, body, sign-offs)..."
            rows={8}
          />

          <div className="form-hint">
            <Shield size={14} /> Payload is analyzed in-memory and not permanently logged.
          </div>

          <div className="form-actions">
            <span>{emailText.length} characters</span>
            <button
              className="primary-button"
              disabled={isAnalyzing || !emailText.trim()}
              onClick={handleScan}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Analyzing Intent...
                </>
              ) : (
                <>
                  Run Semantic Threat Scan <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div
          className="notice-banner"
          style={{
            borderColor: 'rgba(255, 102, 137, 0.4)',
            background: 'rgba(255, 102, 137, 0.08)',
            color: 'var(--red)',
            marginTop: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <AlertTriangle size={17} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {result && (
        <div
          className="panel"
          style={{
            marginTop: '18px',
            border: `1px solid ${isPhish ? 'rgba(255, 102, 137, 0.35)' : 'rgba(76, 231, 173, 0.35)'}`,
            background: isPhish
              ? 'linear-gradient(145deg, rgba(255, 102, 137, 0.08), #10151e)'
              : 'linear-gradient(145deg, rgba(76, 231, 173, 0.07), #10151e)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '16px',
              paddingBottom: '16px',
              borderBottom: '1px solid #242e3d',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isPhish ? (
                <AlertTriangle size={28} color="var(--red)" />
              ) : (
                <CheckCircle2 size={28} color="var(--green)" />
              )}
              <div>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                    letterSpacing: '1px',
                    color: 'var(--muted)',
                  }}
                >
                  VERDICT // {result.analysis_id}
                </span>
                <h2
                  style={{
                    margin: '3px 0 0',
                    fontSize: '22px',
                    fontWeight: 700,
                    color: isPhish ? 'var(--red)' : 'var(--green)',
                  }}
                >
                  {isPhish ? 'CRITICAL THREAT CONFIRMED' : 'COMMUNICATION CLEAR'}
                </h2>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: '28px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--cyan)',
                }}
              >
                {(result.prediction.score * 100).toFixed(2)}%
              </div>
              <div
                style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--muted)',
                  letterSpacing: '1px',
                }}
              >
                CONFIDENCE SCORE
              </div>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <p style={{ margin: 0, color: 'var(--text)', fontSize: '14px', lineHeight: 1.7 }}>
              {result.summary}
            </p>
          </div>

          {result.indicators.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--muted)',
                  letterSpacing: '1px',
                  marginBottom: '8px',
                }}
              >
                DETECTED THREAT TACTICS
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {result.indicators.map((tactic, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: '4px 9px',
                      borderRadius: '6px',
                      border: '1px solid rgba(84, 136, 255, 0.3)',
                      background: 'rgba(84, 136, 255, 0.1)',
                      color: 'var(--blue)',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {tactic}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
              borderTop: '1px solid #1c2634',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted)',
            }}
          >
            <span>ENGINE: {result.prediction.model_name}</span>
            <span>TIMESTAMP: {result.created_at}</span>
          </div>
        </div>
      )}
    </>
  )
}
