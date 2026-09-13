import React from 'react';
import { Ship, ArrowUpRight, ArrowDownRight, Info, AlertTriangle, CheckCircle2, Navigation } from 'lucide-react';
import { AISAttributionResult, AISCandidate } from '../types/investigation';

interface VesselRankingProps {
  attribution: AISAttributionResult;
  selectedCandidate: AISCandidate | null;
  onSelectCandidate: (candidate: AISCandidate) => void;
}

export const VesselRanking: React.FC<VesselRankingProps> = ({
  attribution,
  selectedCandidate,
  onSelectCandidate
}) => {
  const ranking = attribution.ranking || [];

  return (
    <div className="card">
      <div className="card-header" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span className="card-title">
            <Ship size={16} style={{ color: 'var(--accent-cyan)' }} />
            Ranked Suspect Vessels ({attribution.candidate_count})
          </span>
          <span className="badge font-mono" style={{
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            color: 'var(--status-warning)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            fontSize: '0.65rem'
          }}>
            DATA-DRIVEN MULTI-CRITERIA ATTRIBUTION
          </span>
        </div>

        {/* Provenance Disclosure Subtitle */}
        <div style={{
          fontSize: '0.725rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.4,
          backgroundColor: 'var(--bg-input)',
          padding: '0.5rem 0.75rem',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          width: '100%',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.4rem'
        }}>
          <Info size={13} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: '0.1rem' }} />
          <span>
            Suspect ranking is computed dynamically from spatio-temporal proximity, release window correlation, trajectory alignment, kinematic speed anomalies, and transponder continuity. <em>Highest-ranked suspect based on available physical evidence; not deterministic proof of spill causation.</em>
          </span>
        </div>
      </div>

      {ranking.length === 0 ? (
        <div style={{
          padding: '2.5rem 1rem',
          textAlign: 'center',
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.6rem'
        }}>
          <Ship size={32} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            No relevant vessels found in the selected spatial-temporal window.
          </div>
          <div style={{ fontSize: '0.75rem', maxWidth: '440px', lineHeight: 1.4 }}>
            No vessel trajectories intersected within {attribution.search_radius_km ?? 50} km candidate search radius and ±{attribution.time_window_hours ?? 12} h temporal window of the estimated release point.
          </div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.6rem 0.75rem' }}>Rank</th>
              <th style={{ padding: '0.6rem 0.75rem' }}>Vessel Identity</th>
              <th style={{ padding: '0.6rem 0.75rem' }}>Attribution Score</th>
              <th style={{ padding: '0.6rem 0.75rem' }}>Key Evidence & Anomalies</th>
              <th style={{ padding: '0.6rem 0.75rem' }}>Closest Point of Approach</th>
              <th style={{ padding: '0.6rem 0.75rem' }}>CPA Speed / Motion</th>
              <th style={{ padding: '0.6rem 0.75rem' }}>Component Breakdown</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((vessel) => {
              const isSelected = selectedCandidate?.mmsi === vessel.mmsi;
              const isTop = vessel.rank === 1;

              return (
                <tr
                  key={vessel.mmsi}
                  onClick={() => onSelectCandidate(vessel)}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    backgroundColor: isSelected
                      ? 'rgba(245, 158, 11, 0.14)'
                      : isTop
                      ? 'rgba(234, 179, 8, 0.06)'
                      : 'transparent',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  {/* 1. Rank */}
                  <td style={{ padding: '0.75rem' }}>
                    <span className={`badge ${isTop ? 'badge-warning' : 'font-mono'}`} style={{
                      backgroundColor: isTop ? undefined : 'var(--bg-input)',
                      color: isTop ? undefined : 'var(--text-secondary)',
                      fontWeight: 700
                    }}>
                      #{vessel.rank}
                    </span>
                  </td>

                  {/* 2. Vessel Identity */}
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ fontWeight: 600, color: isSelected ? 'var(--status-warning)' : '#fff', fontSize: '0.85rem' }}>
                      {vessel.vessel_name}
                    </div>
                    <div className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '0.4rem', marginTop: '0.15rem' }}>
                      <span>MMSI: {vessel.mmsi}</span>
                      <span>·</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{vessel.ship_type}</span>
                    </div>
                  </td>

                  {/* 3. Attribution Evidence Score */}
                  <td style={{ padding: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="font-mono" style={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        color: vessel.attribution_score_pct >= 80 ? 'var(--status-warning)' : vessel.attribution_score_pct >= 50 ? 'var(--accent-cyan)' : 'var(--text-secondary)'
                      }}>
                        {vessel.attribution_score_pct.toFixed(1)}%
                      </span>
                      <div style={{
                        flex: 1,
                        maxWidth: '55px',
                        height: '5px',
                        backgroundColor: 'var(--border-subtle)',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${Math.min(100, vessel.attribution_score_pct)}%`,
                          height: '100%',
                          backgroundColor: vessel.attribution_score_pct >= 80 ? 'var(--status-warning)' : 'var(--accent-cyan)'
                        }} />
                      </div>
                    </div>
                  </td>

                  {/* 4. Key Evidence & Anomalies */}
                  <td style={{ padding: '0.75rem', maxWidth: '280px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {vessel.evidence_list && vessel.evidence_list.length > 0 ? (
                        vessel.evidence_list.slice(0, 3).map((ev, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.25 }}>
                            <CheckCircle2 size={11} style={{ color: 'var(--status-success)', flexShrink: 0, marginTop: '0.15rem' }} />
                            <span>{ev}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Standard shipping transit</span>
                      )}
                      {vessel.ais_gap_detected && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--status-danger)', fontWeight: 600 }}>
                          <AlertTriangle size={11} />
                          <span>AIS Transponder Blackout Detected</span>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 5. Closest Approach */}
                  <td className="font-mono" style={{ padding: '0.75rem', color: 'var(--text-primary)' }}>
                    <div style={{ fontWeight: 600 }}>
                      {vessel.minimum_distance_km.toFixed(2)} km
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      {new Date(vessel.closest_approach_time).toISOString().replace('T', ' ').substring(0, 16)} UTC
                    </div>
                  </td>

                  {/* 6. CPA Speed / Motion */}
                  <td style={{ padding: '0.75rem' }}>
                    <div className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                      {vessel.speed_at_cpa_knots !== undefined && vessel.speed_at_cpa_knots !== null
                        ? `${vessel.speed_at_cpa_knots.toFixed(1)} kn`
                        : 'N/A'}
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.2rem' }}>
                      {vessel.approaching_origin && (
                        <span className="badge badge-cyan" title="Approaching origin prior to CPA" style={{ padding: '0.1rem 0.35rem', fontSize: '0.62rem' }}>
                          <ArrowDownRight size={9} /> Appr
                        </span>
                      )}
                      {vessel.leaving_origin && (
                        <span className="badge badge-cyan" title="Departing origin post CPA" style={{ padding: '0.1rem 0.35rem', fontSize: '0.62rem' }}>
                          <ArrowUpRight size={9} /> Dep
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 7. Component Scores */}
                  <td className="font-mono" style={{ padding: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <div title="Spatial Proximity (30%) / Temporal (25%) / Alignment (20%) / Kinematics (15%) / Transponder Gap (10%)">
                      <span>Prox: {vessel.scores.distance.toFixed(2)}</span>
                      <br />
                      <span>Temp: {vessel.scores.temporal.toFixed(2)}</span>
                      <br />
                      <span>Align: {vessel.scores.approach.toFixed(2)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Detail Inspector for Selected Candidate */}
      {selectedCandidate && (
        <div style={{
          margin: '0.75rem',
          padding: '0.85rem',
          backgroundColor: 'rgba(15, 23, 42, 0.7)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Navigation size={14} style={{ color: 'var(--status-warning)' }} />
              <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.82rem' }}>
                Inspection Details: #{selectedCandidate.rank} {selectedCandidate.vessel_name} (MMSI: {selectedCandidate.mmsi})
              </span>
            </div>
            <span className="font-mono" style={{ fontSize: '0.78rem', color: 'var(--status-warning)', fontWeight: 700 }}>
              Evidence Score: {selectedCandidate.attribution_score_pct.toFixed(1)}%
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem', fontSize: '0.75rem' }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Vessel Type: </span>
              <strong style={{ color: 'var(--text-primary)' }}>{selectedCandidate.ship_type}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Min Distance (CPA): </span>
              <strong style={{ color: 'var(--text-primary)' }}>{selectedCandidate.minimum_distance_km.toFixed(2)} km</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>CPA Timestamp: </span>
              <strong style={{ color: 'var(--text-primary)' }}>{new Date(selectedCandidate.closest_approach_time).toUTCString()}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Speed at CPA: </span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {selectedCandidate.speed_at_cpa_knots !== undefined && selectedCandidate.speed_at_cpa_knots !== null
                  ? `${selectedCandidate.speed_at_cpa_knots.toFixed(1)} knots`
                  : 'N/A'}
              </strong>
            </div>
          </div>

          {selectedCandidate.evidence_list && selectedCandidate.evidence_list.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '0.4rem', marginTop: '0.2rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                Full Spatio-Temporal Evidence Log
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {selectedCandidate.evidence_list.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-primary)' }}>
                    <CheckCircle2 size={12} style={{ color: 'var(--status-success)', flexShrink: 0 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VesselRanking;
