import React from 'react';
import { Compass, CheckCircle2, XCircle } from 'lucide-react';
import { SpillDetectionResult } from '../types/investigation';

interface SpillDetailsProps {
  spill: SpillDetectionResult;
  sarImageName: string;
}

export const SpillDetails: React.FC<SpillDetailsProps> = ({ spill, sarImageName }) => {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          <Compass size={16} style={{ color: 'var(--accent-cyan)' }} />
          SAR Spill Detection Analytics
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="badge badge-secondary font-mono" style={{ fontSize: '0.65rem' }}>
            Source: SAR U-Net Segmentation
          </span>
          <span className={`badge ${spill.spill_detected ? 'badge-danger' : 'badge-success'}`}>
            {spill.spill_detected ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {spill.spill_detected ? 'Positive Anomaly' : 'Negative'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Image File</div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {sarImageName}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Detected Spill Centroid</div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--status-danger)', marginTop: '0.2rem' }}>
            {spill.centroid
              ? `${spill.centroid.latitude.toFixed(5)}°N, ${spill.centroid.longitude.toFixed(5)}°E`
              : 'N/A'}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Estimated Area</div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--status-danger)', marginTop: '0.2rem' }}>
            {spill.area_km2 !== null && spill.area_km2 !== undefined
              ? `${spill.area_km2.toFixed(4)} km²`
              : spill.area_pixels
              ? `${spill.area_pixels.toLocaleString()} px`
              : 'N/A'}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pixel Bounding Box</div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {spill.bounding_box_pixels
              ? `${spill.bounding_box_pixels.width} × ${spill.bounding_box_pixels.height} px`
              : 'N/A'}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Aspect Ratio</div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {spill.aspect_ratio !== null && spill.aspect_ratio !== undefined ? spill.aspect_ratio.toFixed(2) : 'N/A'}
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Inference Threshold</div>
          <div className="font-mono" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
            {(spill.probability_threshold * 100).toFixed(0)}% Probability
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpillDetails;
