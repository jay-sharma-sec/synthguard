import { useState, useRef } from 'react'
import {
  Video,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  UploadCloud,
  ChevronRight,
  FileVideo,
  X,
  ScanFace
} from 'lucide-react'
import { SynthGuardAPI, type AnalysisResponse } from '../api/client'

export function VideoScanner() {
  const [file, setFile] = useState<File | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      if (selected.size > 100 * 1024 * 1024) {
        setFile(null)
        setResult(null)
        setError('Video files must be 100 MB or smaller and no longer than 120 seconds.')
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
      const res = await SynthGuardAPI.analyzeMedia('video', file)
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
          <h1>Video Forensics</h1>
          <p className="page-subtitle">
            Extract facial Regions of Interest (ROI) and scan for deepfake manipulation artifacts.
          </p>
        </div>
        <div className="heading-status">
          <span /> LOCAL EFFICIENTNET · MTCNN
        </div>
      </div>

      <div className="module-workspace panel">
        <div className="module-workspace-heading">
          <div className="large-module-icon">
            <Video size={25} />
          </div>
          <div>
            <h2>Spatial Artifact Workspace</h2>
            <p>Direct inspection pipeline powered by PyTorch EfficientNet-B0</p>
          </div>
        </div>

        <div className="analysis-form">
          <label>VIDEO PAYLOAD (.MP4, .MOV)</label>
          
          {!file ? (
            <div 
              className="upload-area" 
              onClick={() => fileInputRef.current?.click()}
              style={{ cursor: 'pointer', minHeight: '200px' }}
            >
              <div className="upload-icon">
                <UploadCloud size={25} />
              </div>
              <h3>Upload video evidence</h3>
              <p>MP4, MOV, or M4V · up to 100 MB and 120 seconds.</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept=".mp4,.mov,.m4v,video/mp4,video/quicktime" 
                style={{ display: 'none' }} 
              />
            </div>
          ) : (
            <div style={{ padding: '24px', border: '1px solid #2a3749', borderRadius: '9px', background: '#0a1018', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '42px', height: '42px', display: 'grid', placeItems: 'center', background: 'rgba(57, 232, 255, 0.1)', color: 'var(--cyan)', borderRadius: '8px' }}>
                  <FileVideo size={20} />
                </div>
                <div>
                  <div style={{ color: '#e1ebf8', fontSize: '14px', fontWeight: 600 }}>{file.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB • Ready for frame extraction
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

          <div className="form-hint" style={{ marginTop: '12px' }}>
            <ScanFace size={14} /> System will extract up to 5 frontal face ROIs for forensic analysis.
          </div>

          <div className="form-actions" style={{ marginTop: '20px' }}>
            <span />
            <button
              className="primary-button"
              disabled={isAnalyzing || !file}
              onClick={handleScan}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Processing Frames...
                </>
              ) : (
                <>
                  Run Spatial Threat Scan <ChevronRight size={16} />
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
                  {isSynthetic ? 'DEEPFAKE ARTIFACTS DETECTED' : 'SPATIAL INTEGRITY CONFIRMED'}
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
                MEAN SIGMOID SCORE
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: '16px' }}>
            <p style={{ margin: 0, color: 'var(--text)', fontSize: '14px', lineHeight: 1.7 }}>
              {result.summary}
            </p>
          </div>

          {result.frames && result.frames.length > 0 && (
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
                EXTRACTED FACIAL REGIONS (ROI)
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {result.frames.map((frame, idx) => (
                  <img
                    key={idx}
                    src={frame}
                    alt={`Extracted ROI ${idx + 1}`}
                    style={{
                      width: '64px',
                      height: '64px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid #2a3749',
                      background: '#0a1018'
                    }}
                  />
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
