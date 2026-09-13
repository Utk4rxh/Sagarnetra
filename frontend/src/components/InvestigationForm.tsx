import React, { useState } from 'react';
import {
  Upload,
  Satellite,
  Calendar,
  MapPin,
  Play,
  Sparkles,
  Info,
  Compass
} from 'lucide-react';
import { SARImageInfo } from '../types/investigation';
import { InvestigationParams } from '../api/api';

interface InvestigationFormProps {
  sarImages: SARImageInfo[];
  loadingImages: boolean;
  isExecuting: boolean;
  onSubmit: (params: InvestigationParams) => void;
  onImageChange?: (imageName: string) => void;
}

export const InvestigationForm: React.FC<InvestigationFormProps> = ({
  sarImages,
  loadingImages,
  isExecuting,
  onSubmit,
  onImageChange
}) => {
  // Mode selection: 'benchmark' (Reference Case) or 'new_investigation'
  const [investigationMode, setInvestigationMode] = useState<'benchmark' | 'new_investigation'>('benchmark');

  // Input source: catalog image or file upload
  const [sourceType, setSourceType] = useState<'catalog' | 'upload'>('catalog');
  const [selectedCatalogImage, setSelectedCatalogImage] = useState<string>('00000.tif');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Form input fields
  const [observationTime, setObservationTime] = useState<string>('2019-10-19T15:56:47+00:00');
  const [latitude, setLatitude] = useState<string>('32.54197363135603');
  const [longitude, setLongitude] = useState<string>('30.16044382807175');
  const [locationSource, setLocationSource] = useState<string>('reference_case');
  const [aisSourceMode, setAisSourceMode] = useState<'auto' | 'benchmark' | 'custom'>('auto');
  const [customAisFile, setCustomAisFile] = useState<File | null>(null);

  // Find currently selected image info
  const currentImageInfo = sarImages.find((img) => img.filename === selectedCatalogImage);

  // Switch modes
  const handleModeChange = (mode: 'benchmark' | 'new_investigation') => {
    setInvestigationMode(mode);
    if (mode === 'benchmark') {
      setSourceType('catalog');
      setSelectedCatalogImage('00000.tif');
      setObservationTime('2019-10-19T15:56:47+00:00');
      setLatitude('32.54197363135603');
      setLongitude('30.16044382807175');
      setLocationSource('reference_case');
      setUploadedFile(null);
      if (onImageChange) onImageChange('00000.tif');
    } else {
      // In New Investigation mode, do NOT inject benchmark Mediterranean coordinates
      // Set to suggested center of current image or placeholder values
      if (currentImageInfo && currentImageInfo.center_latitude !== undefined && currentImageInfo.center_latitude !== null) {
        setLatitude(currentImageInfo.center_latitude.toString());
        setLongitude((currentImageInfo.center_longitude ?? 0).toString());
        setLocationSource('image_center_suggestion');
      } else {
        setLatitude('');
        setLongitude('');
        setLocationSource('user_supplied');
      }
      setObservationTime('2019-10-19T12:00:00+00:00');
      if (onImageChange) onImageChange(selectedCatalogImage);
    }
  };

  const handleCatalogImageSelect = (filename: string) => {
    setSelectedCatalogImage(filename);
    if (onImageChange) onImageChange(filename);

    if (investigationMode === 'new_investigation') {
      const imgInfo = sarImages.find((img) => img.filename === filename);
      if (imgInfo && imgInfo.center_latitude !== undefined && imgInfo.center_latitude !== null) {
        setLatitude(imgInfo.center_latitude.toString());
        setLongitude((imgInfo.center_longitude ?? 0).toString());
        setLocationSource('image_center_suggestion');
      }
    }
  };

  const handleApplySuggestedCenter = () => {
    if (currentImageInfo && currentImageInfo.center_latitude !== undefined && currentImageInfo.center_latitude !== null) {
      setLatitude(currentImageInfo.center_latitude.toString());
      setLongitude((currentImageInfo.center_longitude ?? 0).toString());
      setLocationSource('image_center_suggestion');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setUploadedFile(file);
      setLocationSource('user_supplied');
      if (onImageChange) onImageChange(file.name);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedLat = parseFloat(latitude);
    const parsedLon = parseFloat(longitude);

    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      alert('Please provide a valid latitude between -90 and 90 degrees.');
      return;
    }

    if (isNaN(parsedLon) || parsedLon < -180 || parsedLon > 180) {
      alert('Please provide a valid longitude between -180 and 180 degrees.');
      return;
    }

    if (!observationTime.trim()) {
      alert('Please specify an observation date/time in UTC.');
      return;
    }

    if (sourceType === 'upload' && !uploadedFile) {
      alert('Please choose a SAR GeoTIFF file to upload.');
      return;
    }

    onSubmit({
      file: sourceType === 'upload' ? uploadedFile : null,
      imageName: sourceType === 'catalog' ? selectedCatalogImage : undefined,
      observationTime,
      latitude: parsedLat,
      longitude: parsedLon,
      locationSource: investigationMode === 'benchmark' ? 'reference_case' : locationSource,
      aisFile: aisSourceMode === 'custom' ? customAisFile : null,
      aisSource: investigationMode === 'benchmark' ? 'benchmark' : aisSourceMode
    });
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          <Satellite size={16} style={{ color: 'var(--accent-cyan)' }} />
          Investigation Configuration
        </span>
        <span className="badge font-mono" style={{
          backgroundColor: investigationMode === 'benchmark' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(168, 85, 247, 0.15)',
          color: investigationMode === 'benchmark' ? 'var(--accent-cyan)' : 'var(--accent-purple)',
          border: `1px solid ${investigationMode === 'benchmark' ? 'rgba(6, 182, 212, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`
        }}>
          {investigationMode === 'benchmark' ? 'Reference Benchmark' : 'General Investigation'}
        </span>
      </div>

      {/* 1. Mode Switcher Tabs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '0.5rem',
        marginBottom: '1.25rem',
        padding: '0.25rem',
        backgroundColor: 'var(--bg-input)',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)'
      }}>
        <button
          type="button"
          onClick={() => handleModeChange('benchmark')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            padding: '0.55rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: investigationMode === 'benchmark' ? 'var(--accent-cyan)' : 'transparent',
            color: investigationMode === 'benchmark' ? '#000' : 'var(--text-secondary)'
          }}
        >
          <Sparkles size={14} />
          Reference Case
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('new_investigation')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            padding: '0.55rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            backgroundColor: investigationMode === 'new_investigation' ? 'var(--accent-cyan)' : 'transparent',
            color: investigationMode === 'new_investigation' ? '#000' : 'var(--text-secondary)'
          }}
        >
          <Compass size={14} />
          New Investigation
        </button>
      </div>

      {/* Mode A: Benchmark Context Banner */}
      {investigationMode === 'benchmark' ? (
        <div style={{
          backgroundColor: 'rgba(6, 182, 212, 0.08)',
          border: '1px solid rgba(6, 182, 212, 0.25)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.85rem 1rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-cyan" style={{ fontSize: '0.65rem' }}>REFERENCE CASE</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Validated Benchmark</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: 0 }}>
            This reproducible benchmark combines the reference SAR sample (<code>00000.tif</code>) with its validated observation context in the Southeastern Mediterranean Sea (<code>32.54197°N, 30.16044°E</code> · <code>2019-10-19 15:56 UTC</code>).
          </p>
        </div>
      ) : (
        /* Mode B: General Investigation Explanatory Banner */
        <div style={{
          backgroundColor: 'rgba(168, 85, 247, 0.08)',
          border: '1px solid rgba(168, 85, 247, 0.25)',
          borderRadius: 'var(--radius-sm)',
          padding: '0.85rem 1rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>NEW INVESTIGATION</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Dynamic Analysis Mode</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.45, margin: 0 }}>
            Select any SAR image or upload a GeoTIFF. Supply the incident observation coordinates and timestamp. All stages (Segmentation, Lagrangian Hindcasting, and Synthetic AIS correlation) execute dynamically.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Source Toggle for New Investigation Mode */}
        {investigationMode === 'new_investigation' && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              type="button"
              className={`btn btn-sm ${sourceType === 'catalog' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setSourceType('catalog')}
            >
              <Satellite size={13} /> Repository Image
            </button>
            <button
              type="button"
              className={`btn btn-sm ${sourceType === 'upload' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1 }}
              onClick={() => setSourceType('upload')}
            >
              <Upload size={13} /> Upload GeoTIFF
            </button>
          </div>
        )}

        {/* Catalog Selector */}
        {sourceType === 'catalog' ? (
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label className="form-label" style={{ margin: 0 }}>Sentinel-1 SAR Image</label>
              {investigationMode === 'benchmark' && (
                <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)' }}>Benchmark Sample</span>
              )}
            </div>

            <select
              className="form-select font-mono"
              value={selectedCatalogImage}
              onChange={(e) => handleCatalogImageSelect(e.target.value)}
              disabled={investigationMode === 'benchmark' || (loadingImages && sarImages.length === 0)}
            >
              {loadingImages && sarImages.length === 0 ? (
                <option>Loading image catalog...</option>
              ) : sarImages.length > 0 ? (
                sarImages.map((img) => (
                  <option key={img.filename} value={img.filename}>
                    {img.filename} ({img.size_mb} MB)
                    {img.center_latitude !== undefined && img.center_latitude !== null
                      ? ` — [${img.center_latitude.toFixed(2)}°N, ${img.center_longitude?.toFixed(2)}°E]`
                      : ''}
                  </option>
                ))
              ) : (
                <option value="00000.tif">00000.tif (Default)</option>
              )}
            </select>

            {/* Suggested Image Center Indicator in New Investigation Mode */}
            {investigationMode === 'new_investigation' && currentImageInfo?.center_latitude !== undefined && currentImageInfo.center_latitude !== null && (
              <div style={{
                marginTop: '0.45rem',
                padding: '0.5rem 0.65rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.725rem'
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Suggested Image Center: </span>
                  <span className="font-mono" style={{ color: 'var(--accent-cyan)', fontWeight: 500 }}>
                    {currentImageInfo.center_latitude.toFixed(4)}°N, {currentImageInfo.center_longitude?.toFixed(4)}°E
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleApplySuggestedCenter}
                  style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem' }}
                  title="Apply suggested image center to observation coordinates"
                >
                  Apply to Obs
                </button>
              </div>
            )}
          </div>
        ) : (
          /* File Upload Input */
          <div className="form-group">
            <label className="form-label">Upload 2-Band GeoTIFF (VV, VH)</label>
            <div style={{
              border: '2px dashed var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '1.25rem',
              textAlign: 'center',
              backgroundColor: 'var(--bg-input)',
              cursor: 'pointer'
            }}>
              <input
                type="file"
                id="geotiff-file"
                accept=".tif,.tiff"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <label htmlFor="geotiff-file" style={{ cursor: 'pointer', display: 'block' }}>
                <Upload size={24} style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {uploadedFile ? uploadedFile.name : 'Click to select GeoTIFF file'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {uploadedFile ? `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB` : 'Supported formats: .tif, .tiff (2-band)'}
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Section Divider: Observation Context */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          margin: '1.25rem 0 0.75rem 0',
          paddingBottom: '0.35rem',
          borderBottom: '1px solid var(--border-subtle)'
        }}>
          <Compass size={14} style={{ color: 'var(--status-success)' }} />
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Incident Observation Context
          </span>
        </div>

        {/* Observation Timestamp */}
        <div className="form-group">
          <label className="form-label">
            <Calendar size={13} style={{ display: 'inline', marginRight: '0.35rem', color: 'var(--accent-cyan)' }} />
            Observation Timestamp (UTC)
          </label>
          <input
            type="text"
            className="form-input font-mono"
            placeholder="YYYY-MM-DDTHH:MM:SS+00:00"
            value={observationTime}
            onChange={(e) => {
              setObservationTime(e.target.value);
              if (investigationMode === 'new_investigation') setLocationSource('user_supplied');
            }}
            readOnly={investigationMode === 'benchmark'}
            required
          />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {investigationMode === 'benchmark'
              ? 'Validated reference timestamp: 2019-10-19T15:56:47+00:00'
              : 'Format: ISO 8601 UTC (e.g. 2019-10-19T12:00:00+00:00)'}
          </div>
        </div>

        {/* Observation Location Coordinates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">
              <MapPin size={13} style={{ display: 'inline', marginRight: '0.35rem', color: 'var(--status-success)' }} />
              Observation Latitude (°N)
            </label>
            <input
              type="number"
              step="any"
              className="form-input font-mono"
              placeholder="e.g. 32.54197"
              value={latitude}
              onChange={(e) => {
                setLatitude(e.target.value);
                if (investigationMode === 'new_investigation') setLocationSource('user_supplied');
              }}
              readOnly={investigationMode === 'benchmark'}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              <MapPin size={13} style={{ display: 'inline', marginRight: '0.35rem', color: 'var(--status-success)' }} />
              Observation Longitude (°E)
            </label>
            <input
              type="number"
              step="any"
              className="form-input font-mono"
              placeholder="e.g. 30.16044"
              value={longitude}
              onChange={(e) => {
                setLongitude(e.target.value);
                if (investigationMode === 'new_investigation') setLocationSource('user_supplied');
              }}
              readOnly={investigationMode === 'benchmark'}
              required
            />
          </div>
        </div>

        {/* Provenance note */}
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.35rem' }}>
          <Info size={12} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: '0.1rem' }} />
          <span>
            {investigationMode === 'benchmark'
              ? 'Observation coordinates are fixed for benchmark verification. Hindcasting advects backward from this incident point.'
              : 'Observation coordinates represent the reported incident location for environmental hindcasting. SAR spill detection is computed independently.'}
          </span>
        </div>

        {/* AIS Source Mode Selection (Generalized Mode) */}
        {investigationMode === 'new_investigation' && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: 'var(--bg-input)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)'
          }}>
            <label className="form-label" style={{ marginBottom: '0.4rem', fontSize: '0.75rem' }}>
              AIS Correlation Data Source
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '0.5rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${aisSourceMode === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.7rem', padding: '0.35rem 0.25rem' }}
                onClick={() => setAisSourceMode('auto')}
              >
                Auto / Dynamic
              </button>
              <button
                type="button"
                className={`btn btn-sm ${aisSourceMode === 'benchmark' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.7rem', padding: '0.35rem 0.25rem' }}
                onClick={() => setAisSourceMode('benchmark')}
              >
                Benchmark CSV
              </button>
              <button
                type="button"
                className={`btn btn-sm ${aisSourceMode === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.7rem', padding: '0.35rem 0.25rem' }}
                onClick={() => setAisSourceMode('custom')}
              >
                Upload Real AIS
              </button>
            </div>

            {aisSourceMode === 'custom' && (
              <div style={{ marginTop: '0.4rem' }}>
                <input
                  type="file"
                  accept=".csv"
                  className="form-input"
                  style={{ fontSize: '0.75rem', padding: '0.4rem' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      setCustomAisFile(e.target.files[0]);
                    }
                  }}
                  required
                />
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Provide real AIS tracking data (columns: mmsi, timestamp, latitude, longitude, speed, course).
                </div>
              </div>
            )}

            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {aisSourceMode === 'auto'
                ? 'Context-aware mode: dynamically simulates vessel corridors around the estimated hindcast origin and release window.'
                : aisSourceMode === 'benchmark'
                ? 'Uses fixed reference synthetic_ais.csv.'
                : 'Runs attribution exclusively on your provided real AIS dataset without synthetic fallback.'}
            </div>
          </div>
        )}

        {/* Action Button */}
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '0.25rem', padding: '0.85rem' }}
          disabled={isExecuting}
        >
          {isExecuting ? (
            <>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid rgba(0,0,0,0.2)',
                borderTopColor: '#000',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              <span>Executing Automated Pipeline...</span>
            </>
          ) : (
            <>
              <Play size={16} fill="currentColor" />
              <span>
                {investigationMode === 'benchmark' ? 'Run Reference Benchmark' : 'Run Generalized Investigation'}
              </span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default InvestigationForm;
