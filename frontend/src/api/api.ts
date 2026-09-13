import {
  HealthResponse,
  InvestigationResponse,
  SARImageInfo,
  SpillDetectionResult,
} from '../types/investigation';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE}/api/v1/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status: ${response.status}`);
  }
  return response.json();
}

export async function fetchSARImages(limit = 50, offset = 0): Promise<SARImageInfo[]> {
  const response = await fetch(`${API_BASE}/api/v1/sar-images?limit=${limit}&offset=${offset}`);
  if (!response.ok) {
    throw new Error(`Failed to list SAR images: ${response.status}`);
  }
  return response.json();
}

export async function fetchReferenceResults(): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/api/v1/results`);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference results: ${response.status}`);
  }
  return response.json();
}

export interface InvestigationParams {
  file?: File | null;
  imageName?: string;
  observationTime: string;
  latitude: number;
  longitude: number;
  locationSource?: string;
  aisFile?: File | null;
  aisSource?: string;
  timeWindowHours?: number;
}

export async function runInvestigation(params: InvestigationParams): Promise<InvestigationResponse> {
  const formData = new FormData();

  if (params.file) {
    formData.append('file', params.file);
  } else if (params.imageName) {
    formData.append('image_name', params.imageName);
  } else {
    throw new Error('Please select an uploaded GeoTIFF file or a repository SAR image.');
  }

  formData.append('observation_time', params.observationTime);
  formData.append('latitude', params.latitude.toString());
  formData.append('longitude', params.longitude.toString());
  if (params.locationSource) {
    formData.append('location_source', params.locationSource);
  }
  if (params.aisFile) {
    formData.append('ais_file', params.aisFile);
  }
  if (params.aisSource) {
    formData.append('ais_source', params.aisSource);
  }
  if (params.timeWindowHours !== undefined && params.timeWindowHours !== null) {
    formData.append('time_window_hours', params.timeWindowHours.toString());
  }


  const response = await fetch(`${API_BASE}/api/v1/investigate`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = `Investigation failed with status ${response.status}`;
    try {
      const err = await response.json();
      if (err && err.detail) {
        errorDetail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
      }
    } catch {
      // Keep default error detail
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export async function detectSpillOnly(
  file?: File | null,
  imageName?: string,
  threshold = 0.50
): Promise<SpillDetectionResult> {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  } else if (imageName) {
    formData.append('image_name', imageName);
  }
  formData.append('threshold', threshold.toString());

  const response = await fetch(`${API_BASE}/api/v1/detect`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Detection failed' }));
    throw new Error(err.detail || 'Segmentation failed');
  }

  return response.json();
}
