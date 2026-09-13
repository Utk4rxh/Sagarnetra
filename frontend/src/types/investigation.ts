/**
 * Types corresponding to the FastAPI backend schemas
 */

export interface Coordinates {
  latitude: floatNumber;
  longitude: floatNumber;
}

type floatNumber = number;

export interface PixelBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeographicBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface GeoJSONGeometry {
  type: string;
  coordinates: number[][][];
}

export interface GeoJSONFeature {
  type: string;
  properties: {
    image?: string;
    latitude?: number;
    longitude?: number;
    area_km2?: number;
    area_pixels?: number;
    perimeter_pixels?: number;
    aspect_ratio?: number;
    prediction_threshold?: number;
    [key: string]: unknown;
  };
  geometry: GeoJSONGeometry;
}

export interface SpillDetectionResult {
  spill_detected: boolean;
  centroid?: Coordinates | null;
  area_pixels?: number | null;
  area_km2?: number | null;
  perimeter_pixels?: number | null;
  aspect_ratio?: number | null;
  bounding_box_pixels?: PixelBoundingBox | null;
  geographic_bounds?: GeographicBounds | null;
  probability_threshold: number;
  geojson?: GeoJSONFeature | null;
}

export interface HindcastTrajectoryPoint {
  timestamp: string;
  latitude: number;
  longitude: number;
}

export interface HindcastMetadata {
  backtrack_hours: number;
  time_step_hours: number;
  windage_factor: number;
  trajectory_points: number;
}

export interface EnsembleOrigin {
  latitude: number;
  longitude: number;
  particle_count: number;
  confidence_level: number;
}

export interface ProbableOriginRegion {
  min_latitude: number;
  max_latitude: number;
  min_longitude: number;
  max_longitude: number;
}

export interface EnvironmentalSources {
  wind_source: string;
  current_source: string;
}

export interface ObservationMetadata {
  timestamp: string;
  latitude: number;
  longitude: number;
}

export interface HindcastResult {
  observation: ObservationMetadata;
  hindcast: HindcastMetadata;
  deterministic_origin: Coordinates;
  ensemble_origin: EnsembleOrigin;
  probable_origin_region: ProbableOriginRegion;
  trajectory?: HindcastTrajectoryPoint[] | null;
  environmental_data: EnvironmentalSources;
}

export interface AISTrajectoryPoint {
  timestamp: string;
  latitude: number;
  longitude: number;
  speed_knots: number;
  course_deg: number;
}

export interface AISKinematicFeatures {
  min_distance_km: number;
  closest_approach_time: string;
  temporal_offset_hours: number;
  speed_at_cpa_knots: number;
  average_speed_knots: number;
  course_at_cpa_deg: number;
  trajectory_alignment_score: number;
  speed_reduction_knots: number;
  ais_gap_detected: boolean;
  max_gap_minutes: number;
}

export interface AISScoreBreakdown {
  distance: number;
  temporal: number;
  persistence: number;
  approach: number;
  proximity?: number;
  alignment?: number;
  behavior?: number;
  anomaly_gap?: number;
}

export interface AISCandidate {
  rank: number;
  mmsi: number;
  vessel_name: string;
  ship_type: string;
  imo?: number | null;
  callsign?: string | null;
  attribution_score_pct: number;
  minimum_distance_km: number;
  closest_approach_time: string;
  cpa_latitude?: number | null;
  cpa_longitude?: number | null;
  hours_before_observation: number;
  duration_within_20km_hours: number;
  speed_at_cpa_knots?: number | null;
  approaching_origin: boolean;
  leaving_origin: boolean;
  ais_gap_detected?: boolean;
  evidence_list?: string[];
  scores: AISScoreBreakdown;
  kinematics?: AISKinematicFeatures | null;
  trajectory?: AISTrajectoryPoint[];
}

export interface AISAttributionResult {
  candidate_count: number;
  ranking: AISCandidate[];
  scoring_weights: Record<string, number>;
  time_window_hours?: number;
  search_radius_km?: number;
  ais_data_source?: string;
  attribution_type: string;
  scientific_disclaimer: string;
}

export interface InvestigationObservation {
  timestamp: string;
  latitude: number;
  longitude: number;
  location_source: string;
}

export interface InvestigationMetadata {
  sar_image: string;
  observation: InvestigationObservation;
  sar_geometry_source?: string;
  environmental_data_source?: string;
  ais_data_source?: string;
  attribution_type?: string;
}

export interface InvestigationResponse {
  investigation: InvestigationMetadata;
  spill_detection: SpillDetectionResult;
  hindcast?: HindcastResult | null;
  ais_attribution?: AISAttributionResult | null;
  top_candidate?: AISCandidate | null;
}

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  device: string;
  project_root: string;
  environmental_files: {
    era5_wind: boolean;
    copernicus_current: boolean;
    oil_directory: boolean;
  };
  model_checkpoint: {
    exists: boolean;
    path: string;
    is_loaded: boolean;
  };
}

export interface SARImageInfo {
  filename: string;
  size_bytes: number;
  size_mb: number;
  center_latitude?: number | null;
  center_longitude?: number | null;
}

export type PipelineStage = 'idle' | 'sar_analysis' | 'spill_geometry' | 'hindcast' | 'ais_correlation' | 'completed' | 'error';

