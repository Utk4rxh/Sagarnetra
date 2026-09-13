import React from 'react';
import { Satellite, Compass, Wind, Ship, Check, Loader2 } from 'lucide-react';
import { PipelineStage } from '../types/investigation';

interface InvestigationProgressProps {
  stage: PipelineStage;
}

export const InvestigationProgress: React.FC<InvestigationProgressProps> = ({ stage }) => {
  if (stage === 'idle') return null;

  const stages = [
    { id: 'sar_analysis', label: 'SAR Analysis', icon: Satellite, desc: 'U-Net Patch Inference' },
    { id: 'spill_geometry', label: 'Spill Geometry', icon: Compass, desc: 'Connected Components' },
    { id: 'hindcast', label: 'Hindcasting', icon: Wind, desc: 'Lagrangian 24h Simulation' },
    { id: 'ais_correlation', label: 'AIS Correlation', icon: Ship, desc: 'Multi-Factor Vessel Ranking' },
  ];

  const getStageStatus = (stageId: string) => {
    if (stage === 'completed') return 'completed';
    if (stage === 'error') return 'error';

    const order = ['sar_analysis', 'spill_geometry', 'hindcast', 'ais_correlation'];
    const currentIndex = order.indexOf(stage);
    const stageIndex = order.indexOf(stageId);

    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'running';
    return 'pending';
  };

  return (
    <div className="card" style={{ marginBottom: '1.5rem', backgroundColor: 'var(--bg-card-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Scientific Pipeline Execution
        </span>
        <span className="badge badge-cyan font-mono" style={{ fontSize: '0.65rem' }}>
          {stage === 'completed' ? 'Completed' : stage === 'error' ? 'Failed' : 'Processing...'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
        {stages.map((st) => {
          const status = getStageStatus(st.id);
          const Icon = st.icon;

          return (
            <div
              key={st.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: status === 'running' ? 'var(--accent-cyan-glow)' : 'var(--bg-input)',
                border: `1px solid ${status === 'running' ? 'var(--accent-cyan)' : status === 'completed' ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)'}`,
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{
                color: status === 'completed' ? 'var(--status-success)' : status === 'running' ? 'var(--accent-cyan)' : 'var(--text-muted)'
              }}>
                {status === 'completed' ? (
                  <Check size={18} />
                ) : status === 'running' ? (
                  <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Icon size={18} />
                )}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  color: status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)'
                }}>
                  {st.label}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                  {st.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
