import React from 'react';
import { InvestigationResponse } from '../types/investigation';
import { MapPin, Compass, Wind, Ship } from 'lucide-react';

interface ResultSummaryProps {
  result: InvestigationResponse;
}

export const ResultSummary: React.FC<ResultSummaryProps> = ({ result }) => {
  const obs = result.investigation.observation;
  const spill = result.spill_detection;
  const hindcast = result.hindcast;
  const topCandidate = result.top_candidate;

  const getSourceLabel = (src: string) => {
    switch (src) {
      case 'reference_case':
        return 'Reference Benchmark Case';
      case 'image_center_suggestion':
        return 'Suggested Image Center';
      case 'user_supplied':
        return 'User-Supplied Coordinates';
      default:
        return 'User / Reference Case';
    }
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '0.85rem',
      marginBottom: '1.25rem'
    }}>
      {/* 1. Observation Context Metric */}
      <div className="card" style={{ borderLeft: '3px solid var(--status-success)', padding: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <MapPin size={12} style={{ color: 'var(--status-success)' }} />
            1. Observation Context
          </span>
          <span className="badge badge-success" style={{ fontSize: '0.62rem' }}>Input</span>
        </div>
        <div className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
          {obs.latitude.toFixed(4)}°N, {obs.longitude.toFixed(4)}°E
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: 1.3 }}>
          <span style={{ color: 'var(--status-success)', fontWeight: 500 }}>Source: </span>
          {getSourceLabel(obs.location_source)}
        </div>
      </div>

      {/* 2. SAR Spill Detection Metric */}
      <div className="card" style={{ borderLeft: `3px solid ${spill.spill_detected ? 'var(--status-danger)' : 'var(--border-subtle)'}`, padding: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Compass size={12} style={{ color: 'var(--status-danger)' }} />
            2. SAR Spill Detection
          </span>
          {spill.spill_detected ? (
            <span className="badge badge-danger" style={{ fontSize: '0.62rem' }}>Detected</span>
          ) : (
            <span className="badge badge-secondary" style={{ fontSize: '0.62rem' }}>No Anomaly</span>
          )}
        </div>
        {spill.spill_detected && spill.centroid ? (
          <div>
            <div className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--status-danger)' }}>
              {spill.area_km2 !== null && spill.area_km2 !== undefined
                ? `${spill.area_km2.toFixed(3)} km²`
                : `${spill.area_pixels?.toLocaleString()} px`}
            </div>
            <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Centroid: </span>
              {spill.centroid.latitude.toFixed(4)}°N, {spill.centroid.longitude.toFixed(4)}°E
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Below detection threshold
          </div>
        )}
      </div>

      {/* 3. Probable Origin Metric */}
      <div className="card" style={{ borderLeft: '3px solid var(--accent-cyan)', padding: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Wind size={12} style={{ color: 'var(--accent-cyan)' }} />
            3. Probable Origin
          </span>
          <span className="badge badge-cyan font-mono" style={{ fontSize: '0.62rem' }}>
            {hindcast ? `${hindcast.hindcast.backtrack_hours}h Backtrack` : 'Hindcast'}
          </span>
        </div>
        {hindcast ? (
          <div>
            <div className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              {hindcast.ensemble_origin.latitude.toFixed(4)}°N, {hindcast.ensemble_origin.longitude.toFixed(4)}°E
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              <span style={{ color: 'var(--accent-cyan)' }}>Source: </span>
              24h Lagrangian ({hindcast.ensemble_origin.particle_count} particles)
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Hindcast computation pending
          </div>
        )}
      </div>

        {/* 4. Top AIS Suspect Metric */}
        <div className="card" style={{ borderLeft: '3px solid var(--status-warning)', padding: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Ship size={12} style={{ color: 'var(--status-warning)' }} />
              4. Top Candidate
            </span>
            <span className="badge font-mono" style={{
              fontSize: '0.6rem',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              color: 'var(--status-warning)'
            }}>
              {result.investigation.ais_data_source === 'real_ais' || result.investigation.ais_data_source === 'custom_upload'
                ? 'Real AIS'
                : result.investigation.ais_data_source === 'persistent_benchmark'
                ? 'Benchmark AIS'
                : 'Context Synthetic'}
            </span>
          </div>
          {topCandidate ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                  {topCandidate.vessel_name || `MMSI: ${topCandidate.mmsi}`}
                </span>
                <span className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  ({topCandidate.mmsi})
                </span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--status-warning)', marginTop: '0.25rem', fontWeight: 600 }}>
                Evidence Score: {topCandidate.attribution_score_pct.toFixed(1)}% · CPA: {topCandidate.minimum_distance_km.toFixed(2)} km
              </div>
            </div>
          ) : result.ais_attribution ? (
            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.35, marginTop: '0.2rem' }}>
              No relevant vessels found in the selected spatial-temporal window.
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No candidates evaluated
            </div>
          )}
        </div>
    </div>
  );
};

export default ResultSummary;
