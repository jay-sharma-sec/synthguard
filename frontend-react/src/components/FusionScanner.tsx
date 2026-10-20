import { useState, useRef } from 'react'
import {
  Fingerprint,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Shield,
  FileAudio,
  FileVideo,
  UploadCloud,
  X
} from 'lucide-react'
import { SynthGuardAPI, type AnalysisResponse } from '../api/client'
import { downloadThreatReportPdf, getThreatPresentation, makeThreatReport, saveThreatReport } from '../lib/reports'

export function FusionScanner() {
  const [emailText, setEmailText] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const audioRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  const handleScan = async () => {
    if (!emailText.trim() && !audioFile && !videoFile) {
      setError('Please provide at least one piece of evidence (Text, Audio, or Video) to fuse.')
      return
    }
    setIsAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const res = await SynthGuardAPI.analyzeFusion(emailText, audioFile, videoFile)
      setResult(res)
      saveThreatReport(makeThreatReport(res))
      window.dispatchEvent(new Event('synthguard-report-saved'))
      const presentation = getThreatPresentation(res)
      window.dispatchEvent(new CustomEvent('notify', { detail: `${presentation.verdictLabel} (${(res.prediction.score * 100).toFixed(2)}%).` }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed'
      setError(msg)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleExport = () => {
    if (!result) return
    downloadThreatReportPdf(makeThreatReport(result))
    window.dispatchEvent(new CustomEvent('notify', { detail: `PDF report downloaded for ${result.analysis_id}.` }))
  }

  const isThreat = result?.prediction.label.toLowerCase() === 'threat'
  const presentation = result ? getThreatPresentation(result) : null

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Multimodal Fusion</h1>
          <p className="page-subtitle">
            Cross-reference text, audio, and video signals for a unified threat score.
          </p>
        </div>
        <div className="heading-status">
          <span /> LOCAL LATE-FUSION ENGINE
        </div>
      </div>

      <div className="module-workspace panel">
        <div className="module-workspace-heading">
          <div className="large-module-icon">
            <Fingerprint size={25} />
          </div>
          <div>
            <h2>Threat Investigation Workspace</h2>
            <p>Analyze available email, audio, and video evidence together or independently.</p>
          </div>
        </div>

        <div className="analysis-form">
          
          <label>1. EMAIL PAYLOAD</label>
          <textarea
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            placeholder="Paste suspicious communication text here..."
            rows={4}
            style={{ marginBottom: '16px' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label>2. AUDIO PAYLOAD</label>
              {!audioFile ? (
                <div className="upload-area" onClick={() => audioRef.current?.click()} style={{ minHeight: '120px', cursor: 'pointer', padding: '16px' }}>
                  <UploadCloud size={20} style={{ marginBottom: '8px', color: 'var(--cyan)' }} />
                  <p style={{ margin: 0, fontSize: '11px' }}>Upload Audio</p>
                  <input type="file" ref={audioRef} onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file && file.size > 25 * 1024 * 1024) {
                      setError('Audio files must be 25 MB or smaller and no longer than 180 seconds.')
                      e.currentTarget.value = ''
                      return
                    }
                    setError(null)
                    setAudioFile(file || null)
                  }} accept=".wav,.flac,.mp3,.ogg,.m4a,audio/wav,audio/flac,audio/mpeg,audio/ogg,audio/mp4" style={{ display: 'none' }} />
                </div>
              ) : (
                <div style={{ padding: '12px', border: '1px solid #2a3749', borderRadius: '9px', background: '#0a1018', display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><FileAudio size={16} color="var(--cyan)"/><span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{audioFile.name}</span></div>
                  <X size={16} style={{ cursor: 'pointer', color: 'var(--muted)' }} onClick={() => setAudioFile(null)} />
                </div>
              )}
            </div>

            <div>
              <label>3. VIDEO PAYLOAD</label>
              {!videoFile ? (
                <div className="upload-area" onClick={() => videoRef.current?.click()} style={{ minHeight: '120px', cursor: 'pointer', padding: '16px' }}>
                  <UploadCloud size={20} style={{ marginBottom: '8px', color: 'var(--cyan)' }} />
                  <p style={{ margin: 0, fontSize: '11px' }}>Upload Video</p>
                  <input type="file" ref={videoRef} onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file && file.size > 100 * 1024 * 1024) {
                      setError('Video files must be 100 MB or smaller and no longer than 120 seconds.')
                      e.currentTarget.value = ''
                      return
                    }
                    setError(null)
                    setVideoFile(file || null)
                  }} accept=".mp4,.mov,.m4v,video/mp4,video/quicktime" style={{ display: 'none' }} />
                </div>
              ) : (
                <div style={{ padding: '12px', border: '1px solid #2a3749', borderRadius: '9px', background: '#0a1018', display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><FileVideo size={16} color="var(--cyan)"/><span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>{videoFile.name}</span></div>
                  <X size={16} style={{ cursor: 'pointer', color: 'var(--muted)' }} onClick={() => setVideoFile(null)} />
                </div>
              )}
            </div>
          </div>

          <div className="form-hint">
            <Shield size={14} /> Submit any combination of modalities. Audio: up to 25 MB / 180 sec; video: up to 100 MB / 120 sec. Missing signals are skipped and shown in the result.
          </div>

          <div className="form-actions" style={{ marginTop: '20px' }}>
            <span />
            <button className="primary-button" disabled={isAnalyzing || (!emailText.trim() && !audioFile && !videoFile)} onClick={handleScan}>
              {isAnalyzing ? (
                <><Loader2 size={16} className="animate-spin" /> Fusing Signals...</>
              ) : (
                <>Run Unified Threat Scan <ChevronRight size={16} /></>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice-banner" style={{ borderColor: 'rgba(255, 102, 137, 0.4)', background: 'rgba(255, 102, 137, 0.08)', color: 'var(--red)', marginTop: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}><AlertTriangle size={17} /><span>{error}</span></div>
        </div>
      )}

      {result && (
        <div className="panel" style={{ marginTop: '18px', border: `1px solid ${isThreat ? 'rgba(255, 102, 137, 0.35)' : 'rgba(76, 231, 173, 0.35)'}`, background: isThreat ? 'linear-gradient(145deg, rgba(255, 102, 137, 0.08), #10151e)' : 'linear-gradient(145deg, rgba(76, 231, 173, 0.07), #10151e)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', paddingBottom: '16px', borderBottom: '1px solid #242e3d' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isThreat ? <AlertTriangle size={28} color="var(--red)" /> : <CheckCircle2 size={28} color="var(--green)" />}
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '1px', color: 'var(--muted)' }}>VERDICT // {result.analysis_id}</span>
                <h2 style={{ margin: '3px 0 0', fontSize: '22px', fontWeight: 700, color: result.status === 'partial' ? 'var(--amber)' : isThreat ? 'var(--red)' : 'var(--green)' }}>
                  {presentation?.verdictLabel.toUpperCase()}
                </h2>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{(result.prediction.score * 100).toFixed(2)}%</div>
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '1px' }}>{presentation?.scoreLabel.toUpperCase()}</div>
            </div>
          </div>
          
          <div style={{ marginTop: '16px' }}>
            <p style={{ margin: 0, color: 'var(--text)', fontSize: '14px', lineHeight: 1.7 }}>{result.summary}</p>
          </div>

          {result.status === 'partial' && (
            <div className="partial-analysis-notice" role="status">
              Partial analysis: the score uses only signals that were successfully processed. Review the signal statuses below before relying on this result.
            </div>
          )}
          {result.modality_status && (
            <div className="modality-status-grid" aria-label="Submitted signal processing status">
              {Object.entries(result.modality_status).map(([name, status]) => (
                <div className={`modality-status-card modality-${status}`} key={name}>
                  <span className="modality-status-dot" />
                  <div>
                    <strong>{name}</strong>
                    <span>{status.replace('_', ' ')}</span>
                    {result.modality_errors?.[name] && <small>{result.modality_errors[name]}</small>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.indicators.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '1px', marginBottom: '8px' }}>AGGREGATED FORENSIC INDICATORS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {result.indicators.map((tactic, idx) => (
                  <span key={idx} style={{ padding: '4px 9px', borderRadius: '6px', border: '1px solid rgba(84, 136, 255, 0.3)', background: 'rgba(84, 136, 255, 0.1)', color: 'var(--blue)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{tactic}</span>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
            <button className="primary-button" onClick={handleExport}>
              Export PDF Report
            </button>
          </div>
        </div>
      )}
    </>
  )
}
