import type { AnalysisResponse } from '../api/client'
import { jsPDF } from 'jspdf'

export const REPORTS_STORAGE_KEY = 'synthguard_threat_reports'

export interface ThreatReport {
  analysisId: string
  analysisType: string
  status?: string
  score: number
  scoreLabel?: string
  verdict: string
  displayVerdict?: string
  timestamp: string
  modalityScores: Record<string, number | null>
  summary?: string
  indicators?: string[]
  modalityStatus?: Record<string, string>
  modalityErrors?: Record<string, string>
}

export function getThreatPresentation(result: Pick<AnalysisResponse, 'status' | 'prediction' | 'modality_status'>) {
  const processed = Object.entries(result.modality_status || {})
    .filter(([, status]) => status === 'processed')
    .map(([name]) => name)
  const modality = processed.length === 1 ? processed[0] : null
  const modalityNames: Record<string, string> = { email: 'Email', audio: 'Audio', video: 'Video' }
  const scoreLabel = modality ? `${modalityNames[modality]} threat score` : 'Unified threat score'
  const isThreat = result.prediction.label.toLowerCase() === 'threat'

  if (result.status === 'partial') {
    return { scoreLabel, verdictLabel: 'Partial analysis · review signals' }
  }
  if (isThreat) {
    const verdictLabel = modality === 'audio' ? 'Synthetic audio signal detected'
      : modality === 'video' ? 'Synthetic video signal detected'
      : modality === 'email' ? 'Email threat signal detected'
      : 'Multimodal threat signal detected'
    return { scoreLabel, verdictLabel }
  }
  const verdictLabel = modality === 'audio' ? 'No synthetic audio signal detected'
    : modality === 'video' ? 'No synthetic video signal detected'
    : modality === 'email' ? 'No email threat signal detected'
    : 'No threat signal detected'
  return { scoreLabel, verdictLabel }
}

export function extractModalityScores(summary: string): Record<string, number | null> {
  const scores: Record<string, number | null> = {}
  for (const modality of ['Email', 'Audio', 'Video']) {
    const match = summary.match(new RegExp(`${modality}\\s+Score\\s*:\\s*(N/A|[-+]?\\d*\\.?\\d+)`, 'i'))
    scores[modality] = match && match[1].toUpperCase() !== 'N/A' ? Number(match[1]) : null
  }
  return scores
}

export function makeThreatReport(result: AnalysisResponse): ThreatReport {
  const presentation = getThreatPresentation(result)
  return {
    analysisId: result.analysis_id,
    analysisType: result.analysis_type,
    status: result.status,
    score: result.prediction.score,
    scoreLabel: presentation.scoreLabel,
    verdict: result.prediction.label,
    displayVerdict: presentation.verdictLabel,
    timestamp: new Date().toISOString(),
    modalityScores: extractModalityScores(result.summary),
    summary: result.summary,
    indicators: result.indicators,
    modalityStatus: result.modality_status,
    modalityErrors: result.modality_errors,
  }
}

export function downloadThreatReportPdf(report: ThreatReport): void {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  let y = 48

  doc.setFillColor(8, 19, 34)
  doc.rect(0, 0, pageWidth, 36, 'F')
  doc.setTextColor(32, 208, 239)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.text('SynthGuard Threat Report', margin, 23)

  doc.setTextColor(36, 49, 66)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y)
  y += 9
  doc.text(`Analysis ID: ${report.analysisId}`, margin, y)
  y += 9
  doc.text(`Analysis type: ${report.analysisType}`, margin, y)
  y += 14
  if (report.status) {
    doc.text(`Analysis status: ${report.status}`, margin, y)
    y += 10
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`${report.scoreLabel || 'Threat score'}: ${(report.score * 100).toFixed(2)}%`, margin, y)
  y += 9
  doc.text(`Verdict: ${report.displayVerdict || report.verdict}`, margin, y)
  y += 16

  doc.setFontSize(12)
  doc.text('Modality telemetry', margin, y)
  y += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  for (const name of ['Email', 'Audio', 'Video']) {
    const score = report.modalityScores[name]
    const sensorStatus = report.modalityStatus?.[name.toLowerCase()] || 'unknown'
    doc.text(`${name}: ${score === null || score === undefined ? 'N/A' : `${(score * 100).toFixed(2)}%`} · ${sensorStatus.replace('_', ' ')}`, margin + 2, y)
    y += 6
  }

  const addSection = (title: string, body: string) => {
    const lines = doc.splitTextToSize(body, contentWidth)
    const needed = 17 + lines.length * 5
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage()
      y = margin
    }
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(title, margin, y)
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(lines, margin, y)
    y += lines.length * 5 + 3
  }

  if (report.summary) addSection('Analysis summary', report.summary)
  if (report.modalityErrors && Object.keys(report.modalityErrors).length) {
    addSection('Partial analysis details', Object.entries(report.modalityErrors).map(([name, error]) => `${name}: ${error}`).join('\n'))
  }
  if (report.indicators?.length) addSection('Forensic indicators', report.indicators.join(' · '))

  doc.save(`synthguard-report-${report.analysisId}.pdf`)
}

export function saveThreatReport(report: ThreatReport): void {
  try {
    const previous = loadThreatReports()
    const reports = [report, ...previous.filter((item) => item.analysisId !== report.analysisId)]
    localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(reports))
  } catch {
    // Storage can be unavailable or full; the current analysis remains usable.
  }
}

export function loadThreatReports(): ThreatReport[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(REPORTS_STORAGE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item): item is ThreatReport =>
      item && typeof item.analysisId === 'string' && typeof item.score === 'number' &&
      typeof item.verdict === 'string' && typeof item.timestamp === 'string',
    )
  } catch {
    return []
  }
}
