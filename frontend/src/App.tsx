import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { InvestigationForm } from './components/InvestigationForm';
import { InvestigationProgress } from './components/InvestigationProgress';
import { ResultSummary } from './components/ResultSummary';
import { InvestigationMap } from './components/InvestigationMap';
import { SpillDetails } from './components/SpillDetails';
import { HindcastDetails } from './components/HindcastDetails';
import { VesselRanking } from './components/VesselRanking';
import { ScientificDisclaimer } from './components/ScientificDisclaimer';

import {
  HealthResponse,
  InvestigationResponse,
  SARImageInfo,
  AISCandidate,
  PipelineStage
} from './types/investigation';

import {
  fetchHealth,
  fetchSARImages,
  runInvestigation,
  InvestigationParams
} from './api/api';

import { AlertCircle } from 'lucide-react';

export const App: React.FC = () => {
  // System state
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(true);
  const [errorHealth, setErrorHealth] = useState<string | null>(null);

  // Catalog images state
  const [sarImages, setSarImages] = useState<SARImageInfo[]>([]);
  const [loadingImages, setLoadingImages] = useState<boolean>(true);

  // Investigation execution state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>('idle');
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [investigationResult, setInvestigationResult] = useState<InvestigationResponse | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<AISCandidate | null>(null);

  // Initial Data Fetching
  useEffect(() => {
    loadHealth();
    loadCatalog();
  }, []);

  const loadHealth = async () => {
    setLoadingHealth(true);
    setErrorHealth(null);
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch (err: unknown) {
      setErrorHealth(err instanceof Error ? err.message : 'Failed to connect to backend server');
    } finally {
      setLoadingHealth(false);
    }
  };

  const loadCatalog = async () => {
    setLoadingImages(true);
    try {
      const data = await fetchSARImages(60, 0);
      setSarImages(data);
    } catch {
      // Fallback
      setSarImages([]);
    } finally {
      setLoadingImages(false);
    }
  };

  const handleImageChange = (newImageName: string) => {
    if (investigationResult && investigationResult.investigation.sar_image !== newImageName) {
      setInvestigationResult(null);
      setSelectedCandidate(null);
      setPipelineStage('idle');
    }
  };

  const handleRunInvestigation = async (params: InvestigationParams) => {
    setIsExecuting(true);
    setExecutionError(null);
    setPipelineStage('sar_analysis');

    // Staged progress indication to communicate pipeline flow
    const timer1 = setTimeout(() => setPipelineStage('spill_geometry'), 1200);
    const timer2 = setTimeout(() => setPipelineStage('hindcast'), 2500);
    const timer3 = setTimeout(() => setPipelineStage('ais_correlation'), 4000);

    try {
      const response = await runInvestigation(params);
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      setInvestigationResult(response);
      setPipelineStage('completed');

      if (response.top_candidate) {
        setSelectedCandidate(response.top_candidate);
      }
    } catch (err: unknown) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      setPipelineStage('error');
      setExecutionError(err instanceof Error ? err.message : 'An unexpected error occurred during investigation.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="app-container">
      {/* 1. Header Bar */}
      <Header
        health={health}
        loadingHealth={loadingHealth}
        errorHealth={errorHealth}
      />

      {/* 2. Main Dashboard Layout */}
      <main className="main-content">
        {/* Error Banner */}
        {executionError && (
          <div className="card" style={{
            marginBottom: '1.5rem',
            backgroundColor: 'var(--status-danger-bg)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertCircle size={20} style={{ color: 'var(--status-danger)' }} />
              <div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: '0.875rem' }}>
                  Investigation Execution Error
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {executionError}
                </div>
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setExecutionError(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Pipeline Progress */}
        <InvestigationProgress stage={pipelineStage} />

        {/* Dashboard Grid */}
        <div className="grid-dashboard">
          {/* Left Column: Form & Analytics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <InvestigationForm
              sarImages={sarImages}
              loadingImages={loadingImages}
              isExecuting={isExecuting}
              onSubmit={handleRunInvestigation}
              onImageChange={handleImageChange}
            />


            {investigationResult && (
              <>
                <SpillDetails
                  spill={investigationResult.spill_detection}
                  sarImageName={investigationResult.investigation.sar_image}
                />

                {investigationResult.hindcast && (
                  <HindcastDetails hindcast={investigationResult.hindcast} />
                )}
              </>
            )}
          </div>

          {/* Right Column: Key Metrics, Interactive Map & Vessel Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {investigationResult && (
              <ResultSummary result={investigationResult} />
            )}

            {/* Interactive Map Canvas */}
            <InvestigationMap
              result={investigationResult}
              selectedCandidate={selectedCandidate}
              onSelectCandidate={(candidate) => setSelectedCandidate(candidate)}
            />

            {/* Vessel Attribution Ranking Table */}
            {investigationResult?.ais_attribution && (
              <VesselRanking
                attribution={investigationResult.ais_attribution}
                selectedCandidate={selectedCandidate}
                onSelectCandidate={(candidate) => setSelectedCandidate(candidate)}
              />
            )}
          </div>
        </div>

        {/* 3. Scientific & Legal Disclaimer Footer */}
        <ScientificDisclaimer />
      </main>
    </div>
  );
};

export default App;
