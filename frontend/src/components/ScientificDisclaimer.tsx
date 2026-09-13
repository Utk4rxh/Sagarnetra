import React from 'react';
import { Scale } from 'lucide-react';

export const ScientificDisclaimer: React.FC = () => {
  return (
    <div className="card" style={{
      marginTop: '1.5rem',
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      border: '1px solid var(--border-subtle)',
      padding: '1rem 1.25rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        <div style={{ color: 'var(--status-warning)', marginTop: '0.1rem' }}>
          <Scale size={18} />
        </div>
        <div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
            Scientific &amp; Regulatory Attribution Notice
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            AIS attribution is a <strong>spatio-temporal correlation ranking</strong> derived from backward Lagrangian hydrodynamic drift trajectories and AIS broadcast logs. It constitutes investigative intelligence and <strong>is not deterministic proof of causation or legal culpability</strong>.
          </p>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            Reference dataset: DARTIS 2019 (Yang &amp; Singha, 2025) &bull; ERA5 10m Hourly Atmospheric Forcing (ECMWF) &bull; Copernicus Marine Physical Reanalysis (CMEMS).
          </div>
        </div>
      </div>
    </div>
  );
};
