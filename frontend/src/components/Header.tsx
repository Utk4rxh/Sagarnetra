import React from 'react';
import { Shield, Radio, Cpu, HardDrive, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { HealthResponse } from '../types/investigation';

interface HeaderProps {
  health: HealthResponse | null;
  loadingHealth: boolean;
  errorHealth: string | null;
}

export const Header: React.FC<HeaderProps> = ({ health, loadingHealth, errorHealth }) => {
  return (
    <header style={{
      backgroundColor: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-subtle)',
      padding: '0.85rem 2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '1rem'
    }}>
      {/* Brand Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div style={{
          backgroundColor: 'var(--accent-cyan-glow)',
          border: '1px solid rgba(6, 182, 212, 0.4)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-cyan)'
        }}>
          <Shield size={22} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.01em', color: '#fff' }}>
              Sagarnetra
            </h1>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Satellite SAR Oil Spill Segmentation &amp; Lagrangian Vessel Attribution
          </p>
        </div>
      </div>

      {/* System Diagnostics & Backend Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {loadingHealth ? (
          <span className="badge" style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-muted)' }}>
            <Radio size={12} className="animate-pulse" /> Connecting...
          </span>
        ) : errorHealth ? (
          <span className="badge badge-danger">
            <XCircle size={12} /> Backend Offline
          </span>
        ) : health?.status === 'healthy' ? (
          <>
            <span className="badge badge-success">
              <CheckCircle2 size={12} /> System Online
            </span>
            <span className="badge font-mono" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
              <Cpu size={12} style={{ color: 'var(--accent-cyan)' }} />
              Device: {health.device.toUpperCase()}
            </span>
            <span className="badge font-mono" style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
              <HardDrive size={12} style={{ color: 'var(--status-success)' }} />
              ERA5 &amp; Copernicus Ready
            </span>
          </>
        ) : (
          <span className="badge badge-warning">
            <AlertTriangle size={12} /> Degraded Mode
          </span>
        )}
      </div>
    </header>
  );
};
