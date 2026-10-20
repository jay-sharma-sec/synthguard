import { useState, useRef } from 'react'
import {
  AudioLines,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  UploadCloud,
  ChevronRight,
  FileAudio,
  X
} from 'lucide-react'
import { SynthGuardAPI, type AnalysisResponse } from '../api/client'

export function AudioScanner() {
  const [file, setFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      if (selected.size > 25 * 1024 * 1024) {
        setFile(null)
        setResult(null)
        setError('Audio files must be 25 MB or smaller and no longer than 180 seconds.')
        return
      }
      setFile(selected)
      setResult(null)
      setError(null)
    }
  }

  const handleScan = async () => {
    if (!file) return

    setIsAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const res = await SynthGuardAPI.analyzeMedia('audio', file)
      setResult(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed'
      setError(msg)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const isSynthetic = result?.prediction.label.toLowerCase() === 'synthetic'

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Audio Forensics</h1>
          <p className="page-subtitle">
            Analyze acoustic features for synthetic speech signatures and AI voice cloning.
          </p>
        </div>
        <div className="heading-status">
          <span /> LOCAL AUDIO CNN
        </div>
      </div>

      <div className="module-workspace panel">
        <div className="module-workspace-heading">
          <div className="large-module-icon">
            <AudioLines size={25} />
          </div>
          <div>
            <h2>Audio Forensic Workspace</h2>
            <p>Local MFCC feature extraction and PyTorch CNN inference.</p>
          </div>
        </div>

        <div className="analysis-form">
          <label>AUDIO PAYLOAD (.WAV, .FLAC)</label>
          
          {!file ? (
            <div 
              className="upload-area" 
              onClick={() => fileInputRef.current?.click()}
              style={{ cursor: 'pointer', minHeight: '200px' }}
            >
              <div className="upload-icon">
                <UploadCloud size={25} />
              </div>
              <h3>Upload audio evidence</h3>
              <p>WAV, FLAC, MP3, OGG, or M4A · up to 25 MB and 180 seconds.</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept=".wav,.flac,.mp3,.ogg,.m4a,audio/wav,audio/flac,audio/mpeg,audio/ogg,audio/mp4" 
                style={{ display: 'none' }} 
              />
            </div>
          ) : (
            <div style={{ padding: '24px', border: '1px solid #2a3749', borderRadius: '9px', background: '#0a1018', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', display: 'grid', placeItems: 'center', background: 'rgba(57, 232, 255, 0.1)', color: 'var(--cyan)', borderRadius: '8px' }}>
                  <FileAudio size={20} />
                </div>
                <div>
                  <div style={{ color: '#e1ebf8', fontSize: '14px', fontWeight: 600 }}>{file.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB • Ready for scan
                  </div>
                </div>
              </div>
              <button 
                onClick={() => { setFile(null); setResult(null); setError(null); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: '20px' }}>
            <span />
            <button
              className="primary-button"
              disabled={isAnalyzing || !file}
              onClick={handleScan}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Extracting Features...
                </>
              ) : (
                <>
                  Run Acoustic Threat Scan <ChevronRight size={16} />
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
            border: `1px solid ${isSynthetic ? 'rgba(255, 102, 137, 0.35)' : 'rgba(76, 231, 173, 0.35)'}`,
            background: isSynthetic
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
              {isSynthetic ? (
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
                    color: isSynthetic ? 'var(--red)' : 'var(--green)',
                  }}
                >
                  {isSynthetic ? 'SYNTHETIC AUDIO DETECTED' : 'GENUINE AUDIO CONFIRMED'}
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

          <div
            style={{
              marginTop: '16px',
              paddingTop: '12px',
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
