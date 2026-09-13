import React from 'react';
import { Wind } from 'lucide-react';
import { HindcastResult } from '../types/investigation';

interface HindcastDetailsProps {
  hindcast: HindcastResult;
}

export const HindcastDetails: React.FC<HindcastDetailsProps> = ({ hindcast }) => {
  const origin = hindcast.ensemble_origin;
  const bounds = hindcast.probable_origin_region;
  const meta = hindcast.hindcast;
  const obs = hindcast.observation;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          <Wind size={16} style={{ color: 'var(--accent-cyan)' }} />
          Environmental Hindcast &amp; Drift Dynamics
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge badge-cyan font-mono" style={{ fontSize: '0.65rem' }}>
            Lagrangian 500-Particle Ensemble
          </span>
          <span className="badge badge-cyan font-mono">
            {meta.backtrack_hours}h Backtrack
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Starting Observation</div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--status-success)', marginTop: '0.2rem' }}>
            {obs.latitude.toFixed(5)}°N, {obs.longitude.toFixed(5)}°E
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Ensemble Mean Origin</div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-cyan)', marginTop: '0.2rem' }}>
            {origin.latitude.toFixed(5)}°N, {origin.longitude.toFixed(5)}°E
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>95% Confidence Bounds</div>
          <div className="font-mono" style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {bounds.min_latitude.toFixed(3)}°–{bounds.max_latitude.toFixed(3)}°N<br />
            {bounds.min_longitude.toFixed(3)}°–{bounds.max_longitude.toFixed(3)}°E
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Monte Carlo Particles</div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {origin.particle_count} particles
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Atmospheric Forcing</div>
          <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {hindcast.environmental_data.wind_source}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hydrodynamic Forcing</div>
          <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {hindcast.environmental_data.current_source}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HindcastDetails;
