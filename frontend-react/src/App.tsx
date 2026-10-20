import { useEffect, useState } from 'react'
import {
  Activity,
  AudioLines,
  Bell,
  ChevronRight,
  CircleHelp,
  Download,
  FileText,
  Fingerprint,
  Gauge,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  ScanFace,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Video,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './App.css'
import { EmailScanner } from './components/EmailScanner'
import { AudioScanner } from './components/AudioScanner'
import { VideoScanner } from './components/VideoScanner'
import { SynthGuardAPI } from './api/client'
import { FusionScanner } from './components/FusionScanner'
import { downloadThreatReportPdf, loadThreatReports } from './lib/reports'

type Page =
  | 'Dashboard'
  | 'Email Intelligence'
  | 'Audio Forensics'
  | 'Video Forensics'
  | 'Multimodal Fusion'
  | 'Threat Reports'
  | 'Settings'

const navigation: { name: Page; icon: LucideIcon }[] = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Email Intelligence', icon: ShieldAlert },
  { name: 'Audio Forensics', icon: AudioLines },
  { name: 'Video Forensics', icon: Video },
  { name: 'Multimodal Fusion', icon: Fingerprint },
  { name: 'Threat Reports', icon: FileText },
  { name: 'Settings', icon: Settings },
]

function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [page, setPage] = useState<Page>('Dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [notification, setNotification] = useState('')
  const [hasUnreadNotification, setHasUnreadNotification] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1450)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const handleNotify = (event: Event) => {
      const message = (event as CustomEvent<string>).detail
      if (typeof message !== 'string' || !message.trim()) return
      setNotification(message)
      setHasUnreadNotification(true)
    }
    window.addEventListener('notify', handleNotify)
    return () => window.removeEventListener('notify', handleNotify)
  }, [])

  function navigate(next: Page) {
    setPage(next)
    setSidebarOpen(false)
    setNotice('')
  }

  return (
    <>
      {showSplash && <SplashScreen />}
      <div className="app-shell">
        {sidebarOpen && (
          <button
            className="mobile-overlay"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="brand">
            <div className="brand-mark">
              <BrandMark size={25} />
            </div>
            <div>
              <div className="brand-name">
                Synth<span>Guard</span>
              </div>
              <div className="brand-caption">THREAT INTELLIGENCE</div>
            </div>
            <button
              className="icon-button sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="nav-label">ANALYSIS</div>
          <nav className="navigation">
            {navigation.slice(0, 5).map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={`nav-item ${page === name ? 'nav-active' : ''}`}
                onClick={() => navigate(name)}
              >
                <Icon size={18} />
                <span>{name}</span>
                {name === 'Dashboard' && <span className="nav-indicator" />}
              </button>
            ))}
          </nav>

          <div className="nav-label secondary-label">MANAGEMENT</div>
          <nav className="navigation">
            {navigation.slice(5).map(({ name, icon: Icon }) => (
              <button
                key={name}
                className={`nav-item ${page === name ? 'nav-active' : ''}`}
                onClick={() => navigate(name)}
              >
                <Icon size={18} />
                <span>{name}</span>
              </button>
            ))}
          </nav>

          <button
            className="nav-item help-link"
            onClick={() =>
              setNotice('SynthGuard interface help: select an analysis module to get started.')
            }
          >
            <CircleHelp size={18} />
            <span>Help & documentation</span>
          </button>
        </aside>

        <main className="main-area">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button mobile-menu"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
              >
                <Menu size={21} />
              </button>
              <span className="breadcrumb-muted">Workspace</span>
              <ChevronRight size={15} className="breadcrumb-chevron" />
              <span className="breadcrumb-current">{page}</span>
            </div>
            <div className="topbar-right">
              <div className="environment-pill">
                <span /> LOCAL ENVIRONMENT
              </div>
              <button
                className="icon-button notification-button"
                aria-label={hasUnreadNotification ? 'Notifications, unread' : 'Notifications'}
                onClick={() => {
                  setNotice(notification || 'You are all caught up. No new notifications.')
                  setHasUnreadNotification(false)
                }}
              >
                <Bell size={18} />
                {hasUnreadNotification && <span className="notification-dot" />}
              </button>
            </div>
          </header>

          <div className="page-content">
            {notice && (
              <div className="notice-banner">
                <span>{notice}</span>
                <button
                  className="icon-button"
                  onClick={() => setNotice('')}
                  aria-label="Dismiss notification"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {page === 'Dashboard' ? (
              <Dashboard navigate={navigate} />
            ) : page === 'Email Intelligence' ? (
              <EmailScanner />
            ) : page === 'Audio Forensics' ? (
              <AudioScanner />
            ) : page === 'Video Forensics' ? (
              <VideoScanner />
            ) : page === 'Multimodal Fusion' ? (
              <FusionScanner />
            ) : page === 'Threat Reports' ? (
              <Reports navigate={navigate} />
            ) : page === 'Settings' ? (
              <SettingsPage />
            ) : (
              <ModulePage page={page} />
            )}
          </div>
        </main>
      </div>
    </>
  )
}

function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 164 164" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="sg-shield" x1="25" y1="12" x2="139" y2="151" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8F0FC" />
          <stop offset="0.3" stopColor="#39E8FF" />
          <stop offset="0.7" stopColor="#168DFF" />
          <stop offset="1" stopColor="#2456D8" />
        </linearGradient>
        <linearGradient id="sg-letter" x1="47" y1="38" x2="116" y2="126" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F3FBFF" />
          <stop offset="0.45" stopColor="#39E8FF" />
          <stop offset="1" stopColor="#5488FF" />
        </linearGradient>
      </defs>
      <path d="M82 8 139 29v44c0 38-22 65-57 84C47 138 25 111 25 73V29L82 8Z" fill="#0B1626" stroke="url(#sg-shield)" strokeWidth="5" strokeLinejoin="round" />
      <path d="M82 19 128 36v37c0 30-17 52-46 72-29-20-46-42-46-72V36l46-17Z" stroke="#39E8FF" strokeOpacity=".25" strokeWidth="1.5" />
      <path d="M108 43H69c-13 0-21 7-21 17 0 8 5 13 17 18l31 13c13 5 20 13 20 24 0 17-14 28-34 28H54" stroke="url(#sg-letter)" strokeWidth="13" strokeLinecap="square" strokeLinejoin="round" />
      <path d="M57 43h50M55 126h29" stroke="#E8F0FC" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round" />
      <path d="M82 8v16" stroke="#E8F0FC" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function SplashScreen() {
  return (
    <div className="splash-screen" role="status" aria-label="Loading SynthGuard">
      <img
        className="splash-art"
        src="/synthguard-splash.svg"
        alt="SynthGuard — Threat Intelligence. Initialising interface."
        draggable={false}
      />
    </div>
  )
}

function Dashboard({ navigate }: { navigate: (page: Page) => void }) {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null)
  const [modelsAvailable, setModelsAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    SynthGuardAPI.checkHealth()
      .then((health) => {
        setBackendOnline(true)
        setModelsAvailable(['email', 'audio', 'video'].every((name) => health.models[name]?.available === true))
      })
      .catch(() => {
        setBackendOnline(false)
        setModelsAvailable(false)
      })
  }, [])

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            See beyond <span>the surface.</span>
          </h1>
        </div>
        <div className="heading-status">
          <span /> INTERFACE READY
        </div>
      </div>

      <section className="hero-panel">
        <div className="hero-content">
          <div className="hero-eyebrow"><span /> MULTIMODAL THREAT INTELLIGENCE</div>
          <h2>See the whole signal.<br /><span>Stop the next threat.</span></h2>
          <p>
            Connect suspicious messages with voice and video evidence in one local investigation workspace.
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={() => navigate('Multimodal Fusion')}>
              Start an investigation <ChevronRight size={17} />
            </button>
            <button className="secondary-button" onClick={() => navigate('Threat Reports')}>
              View threat reports
            </button>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="visual-core">
            <ShieldCheck size={48} strokeWidth={1.25} />
          </div>
          <div className="visual-point point-one" />
          <div className="visual-point point-two" />
          <div className="visual-point point-three" />
        </div>
      </section>

      <section className="metrics-grid">
        <Metric icon={ShieldCheck} label="Analysis modules" value="04" detail="Email · Audio · Video · Fusion" tone="green" />
        <Metric icon={Activity} label="Workspace status" value="Ready" detail="Analyst console available" tone="blue" />
        <Metric
          icon={ScanFace}
          label="Detection engine"
          value={backendOnline === null ? 'Checking' : !backendOnline ? 'Offline' : modelsAvailable ? 'Online' : 'Degraded'}
          detail={modelsAvailable ? 'All three models loaded' : backendOnline ? 'One or more models unavailable' : 'Local backend not connected'}
          tone={backendOnline === false || modelsAvailable === false ? 'amber' : 'green'}
        />
        <Metric icon={LockKeyhole} label="Environment" value="Isolated" detail="Local processing workspace" tone="green" />
      </section>

      <div className="section-heading modules-heading">
        <div>
          <h2>Investigation modules</h2>
        </div>
      </div>

      <section className="modules-grid">
        <ModuleCard
          icon={ShieldAlert}
          number="01"
          title="Email Intelligence"
          description="Inspect suspicious messages and investigate potential phishing indicators."
          status="TEXT ANALYSIS"
          tone="green"
          onClick={() => navigate('Email Intelligence')}
        />
        <ModuleCard
          icon={AudioLines}
          number="02"
          title="Audio Forensics"
          description="Open the audio analysis workspace for synthetic voice investigations."
          status="AUDIO ANALYSIS"
          tone="purple"
          onClick={() => navigate('Audio Forensics')}
        />
        <ModuleCard
          icon={Video}
          number="03"
          title="Video Forensics"
          description="Open the video analysis workspace for deepfake investigations."
          status="VIDEO ANALYSIS"
          tone="blue"
          onClick={() => navigate('Video Forensics')}
        />
        <ModuleCard
          icon={Fingerprint}
          number="04"
          title="Multimodal Fusion"
          description="Explore a unified workspace for examining multiple signal types."
          status="MULTIMODAL"
          tone="amber"
          onClick={() => navigate('Multimodal Fusion')}
        />
      </section>

      <section className="bottom-grid">
        <div className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h3>Workspace activity</h3>
              <p>Current session overview</p>
            </div>
            <span className="live-label">
              <span /> LIVE SESSION
            </span>
          </div>
          <div className="activity-empty">
            <div className="empty-icon">
              <Activity size={21} />
            </div>
            <strong>No investigation activity yet</strong>
            <p>Your activity will appear here as you work through the analysis modules.</p>
          </div>
        </div>

        <div className="panel system-panel">
          <div className="panel-heading">
            <div>
              <h3>System status</h3>
              <p>Interface health indicators</p>
            </div>
            <Gauge size={19} />
          </div>
          <StatusRow label="Dashboard interface" status="Operational" />
          <StatusRow label="Navigation" status="Operational" />
          <StatusRow
            label="Python backend"
            status={backendOnline === null ? 'Checking...' : backendOnline ? 'Operational' : 'Not connected'}
            warning={!backendOnline}
          />
          <StatusRow
            label="Model inference"
            status={modelsAvailable === null ? 'Checking...' : modelsAvailable ? 'All models loaded' : 'Some models unavailable'}
            warning={modelsAvailable === false}
          />
          <div className="system-note">
            <LockKeyhole size={14} />{' '}
            {modelsAvailable
              ? 'Email, audio, and video model weights loaded in the local backend.'
              : backendOnline
                ? 'Backend responds, but one or more model weights did not load.'
              : 'Detection results require the Python backend on port 8000.'}
          </div>
        </div>
      </section>
    </>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail: string
  tone: string
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon tone-${tone}`}>
        <Icon size={19} />
      </div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </div>
  )
}

function ModuleCard({
  icon: Icon,
  number,
  title,
  description,
  status,
  tone,
  onClick,
}: {
  icon: LucideIcon
  number: string
  title: string
  description: string
  status: string
  tone: string
  onClick: () => void
}) {
  return (
    <button className="module-card" onClick={onClick}>
      <div className="module-card-top">
        <div className={`module-icon tone-${tone}`}>
          <Icon size={21} />
        </div>
        <span className="module-number">{number}</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="module-card-bottom">
        <span className={`module-status status-${tone}`}>
          <span />
          {status}
        </span>
        <span className="module-arrow">
          <ChevronRight size={17} />
        </span>
      </div>
    </button>
  )
}

function StatusRow({
  label,
  status,
  warning = false,
}: {
  label: string
  status: string
  warning?: boolean
}) {
  return (
    <div className="status-row">
      <span className="status-name">{label}</span>
      <span className={`status-value ${warning ? 'status-warning' : ''}`}>
        <span />
        {status}
      </span>
    </div>
  )
}

function ModulePage({ page }: { page: Page }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{page}</h1>
          <p className="page-subtitle">Bring multiple forms of evidence together for a broader investigation.</p>
        </div>
        <div className="heading-status">
          <span /> WORKSPACE READY
        </div>
      </div>

      <div className="module-workspace panel">
        <div className="module-workspace-heading">
          <div className="large-module-icon">
            <Fingerprint size={25} />
          </div>
          <div>
            <h2>{page} workspace</h2>
            <p>Prepare evidence for a future analysis run.</p>
          </div>
        </div>

        <div className="upload-area">
          <div className="upload-icon">
            <Upload size={25} />
          </div>
          <h3>Investigation evidence</h3>
          <p>Multimodal evidence processing pipeline.</p>
          <span className="coming-soon-label">
            <span /> READY FOR CONNECTOR
          </span>
        </div>
      </div>

      <div className="panel integration-panel">
        <div className="integration-icon">
          <LockKeyhole size={18} />
        </div>
        <div>
          <h3>Next module in pipeline</h3>
          <p>
            Email, Audio, and Video Intelligence are connected. Multimodal Fusion can now be wired
            directly to the active FastAPI endpoints.
          </p>
        </div>
      </div>
    </>
  )
}

function Reports({ navigate }: { navigate: (page: Page) => void }) {
  const [reports, setReports] = useState(loadThreatReports)

  useEffect(() => {
    const refresh = () => setReports(loadThreatReports())
    window.addEventListener('storage', refresh)
    window.addEventListener('synthguard-report-saved', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('synthguard-report-saved', refresh)
    }
  }, [])

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Threat reports</h1>
          <p className="page-subtitle">Review and manage investigation findings in one place.</p>
        </div>
      </div>
      {reports.length === 0 ? (
        <div className="panel empty-reports">
          <div className="empty-icon"><FileText size={25} /></div>
          <h2>No reports yet</h2>
          <p>Run a multimodal scan to create a report. You can download its PDF from this page afterward.</p>
          <button className="primary-button" onClick={() => navigate('Multimodal Fusion')}>
            Start an investigation <ChevronRight size={16} />
          </button>
        </div>
      ) : (
        <div className="panel report-list">
          {reports.map((report) => (
            <article className="report-row" key={report.analysisId}>
              <div className="report-icon"><FileText size={18} /></div>
              <div className="report-details">
                <strong>{report.displayVerdict || report.verdict} · {report.analysisType}{report.status === 'partial' ? ' · partial' : ''}</strong>
                <span>{report.analysisId} · {new Date(report.timestamp).toLocaleString()}</span>
                <span className="report-modalities">
                  {Object.entries(report.modalityScores || {}).filter(([, score]) => score !== null).map(([name, score]) => `${name} ${(Number(score) * 100).toFixed(1)}%`).join('  ·  ') || 'No individual modality scores'}
                </span>
              </div>
              <div className="report-score">
                {(report.score * 100).toFixed(2)}%
                <span>{report.scoreLabel || 'Threat score'}</span>
              </div>
              <button
                className="report-download-button"
                onClick={() => {
                  downloadThreatReportPdf(report)
                  window.dispatchEvent(new CustomEvent('notify', { detail: `PDF report downloaded for ${report.analysisId}.` }))
                }}
                aria-label={`Download PDF report for ${report.analysisId}`}
              >
                <Download size={15} /> <span>Download PDF</span>
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  )
}

function SettingsPage() {
  const [compact, setCompact] = useState(false)
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p className="page-subtitle">Manage local interface preferences and environment information.</p>
        </div>
      </div>
      <div className="settings-layout">
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h3>Interface preferences</h3>
              <p>Personalize your workspace.</p>
            </div>
            <Settings size={19} />
          </div>
          <div className="setting-row">
            <div>
              <strong>Compact layout</strong>
              <p>Reduce spacing between dashboard elements.</p>
            </div>
            <button
              className={`toggle ${compact ? 'toggle-on' : ''}`}
              onClick={() => setCompact(!compact)}
              aria-pressed={compact}
            >
              <span />
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Local environment</strong>
              <p>Current interface environment indicator.</p>
            </div>
            <span className="setting-value">
              <span /> Local
            </span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Python backend</strong>
              <p>Connection state for analysis services.</p>
            </div>
            <span className="setting-value">Port 8000 (FastAPI)</span>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h3>About SynthGuard</h3>
              <p>Workspace information.</p>
            </div>
            <Shield size={19} />
          </div>
          <div className="setting-row">
            <div>
              <strong>Application</strong>
              <p>Synthetic media and threat analysis interface.</p>
            </div>
            <span className="setting-value">SynthGuard</span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Frontend</strong>
              <p>React and TypeScript.</p>
            </div>
            <span className="setting-value">React + TS</span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Inference pipeline</strong>
              <p>FastAPI local model service.</p>
            </div>
            <span className="setting-value">Active</span>
          </div>
        </section>
      </div>
      {confirm && (
        <div className="notice-banner">
          These preferences are temporary and reset when the page reloads.
          <button className="icon-button" onClick={() => setConfirm(false)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
      <button className="secondary-button settings-help" onClick={() => setConfirm(true)}>
        <CircleHelp size={16} /> About these settings
      </button>
    </>
  )
}

export default App
