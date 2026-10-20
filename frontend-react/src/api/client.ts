const API_BASE = `${import.meta.env.VITE_API_BASE || '/api'}`.replace(/\/$/, '');

export interface Prediction {
  label: string;
  score: number;
  score_type: string;
  model_name: string;
}

export interface AnalysisResponse {
  analysis_id: string;
  analysis_type: string;
  status: string;
  prediction: Prediction;
  summary: string;
  indicators: string[];
  frames?: string[];
  created_at: string;
  modality_status?: Record<string, 'not_provided' | 'processed' | 'failed' | 'unavailable' | 'pending'>;
  modality_errors?: Record<string, string>;
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => ({}))
  const detail = payload?.detail
  if (typeof detail === 'string') return new Error(detail)
  if (detail && typeof detail === 'object') {
    const message = typeof detail.message === 'string' ? detail.message : fallback
    const failedSensors = Object.entries(detail.modality_status || {})
      .filter(([, status]) => status === 'failed' || status === 'unavailable')
      .map(([sensor]) => sensor)
    return new Error(failedSensors.length ? `${message} Affected signals: ${failedSensors.join(', ')}.` : message)
  }
  return new Error(fallback)
}

export interface HealthResponse {
  status: string
  models: Record<string, { available: boolean; model_name: string }>
}

export const SynthGuardAPI = {
  checkHealth: async (): Promise<HealthResponse> => {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error("Backend unreachable");
    return res.json();
  },

  analyzeEmail: async (text: string): Promise<AnalysisResponse> => {
    const res = await fetch(`${API_BASE}/analyze/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    
    if (!res.ok) throw await responseError(res, "Email analysis failed");
    return res.json();
  },
  
  analyzeMedia: async (type: 'audio' | 'video', file: File): Promise<AnalysisResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    
    const res = await fetch(`${API_BASE}/analyze/${type}`, {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) throw await responseError(res, `${type} analysis failed`);
    return res.json();
  },

  analyzeFusion: async (
    emailText: string, 
    audioFile: File | null, 
    videoFile: File | null
  ): Promise<AnalysisResponse> => {
    const formData = new FormData();
    if (emailText) formData.append("email_text", emailText);
    if (audioFile) formData.append("audio_file", audioFile);
    if (videoFile) formData.append("video_file", videoFile);
    
    const res = await fetch(`${API_BASE}/analyze/multimodal`, {
      method: "POST",
      body: formData,
    });
    
    if (!res.ok) throw await responseError(res, 'Fusion analysis failed');
    return res.json();
  }
};
