import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { InvestigationResponse, AISCandidate } from '../types/investigation';
import { Map as MapIcon, Layers, Compass, Focus, Maximize2, Eye, EyeOff, Navigation } from 'lucide-react';

interface InvestigationMapProps {
  result: InvestigationResponse | null;
  selectedCandidate: AISCandidate | null;
  onSelectCandidate?: (candidate: AISCandidate) => void;
}

type BasemapType = 'osm' | 'satellite' | 'ocean';

const BASEMAP_CONFIGS: Record<BasemapType, { name: string; url: string; attribution: string; maxZoom: number }> = {
  osm: {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom: 19
  },
  satellite: {
    name: 'Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics, USDA, USGS, AeroGRID, IGN',
    maxZoom: 18
  },
  ocean: {
    name: 'Ocean (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_OceanBase/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic',
    maxZoom: 13
  }
};

/**
 * Calculate forward azimuth/bearing in degrees (0-360) between two coordinates.
 */
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(rLat2);
  const x = Math.cos(rLat1) * Math.sin(rLat2) - Math.sin(rLat1) * Math.cos(rLat2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Generate distinct SVG ship silhouette depending on vessel type and rank status.
 */
function getShipSvg(shipType: string, isTop: boolean, isSelected: boolean): string {
  const fillColor = isSelected ? '#22d3ee' : isTop ? '#f59e0b' : '#38bdf8';
  const strokeColor = isSelected || isTop ? '#ffffff' : '#0a101f';
  const typeLower = (shipType || '').toLowerCase();

  if (typeLower.includes('tanker')) {
    // Tanker: elongated hull with rounded stern, pointed bow, bridge aft, cargo manifold marks
    return `
      <svg width="24" height="34" viewBox="0 0 24 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8.5 7 6 13 6 26C6 29 8.5 31.5 12 31.5C15.5 31.5 18 29 18 26C18 13 15.5 7 12 2Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.6"/>
        <rect x="9.5" y="10" width="5" height="2" rx="0.8" fill="${strokeColor}" opacity="0.9"/>
        <rect x="9.5" y="14" width="5" height="2" rx="0.8" fill="${strokeColor}" opacity="0.9"/>
        <rect x="9.5" y="18" width="5" height="2" rx="0.8" fill="${strokeColor}" opacity="0.9"/>
        <rect x="8.5" y="24" width="7" height="4" rx="1" fill="${strokeColor}" opacity="0.95"/>
      </svg>
    `;
  } else if (typeLower.includes('container')) {
    // Container ship: hull packed with container bay stacks
    return `
      <svg width="24" height="34" viewBox="0 0 24 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8 7 5.5 14 5.5 27C5.5 30 8 32 12 32C16 32 18.5 30 18.5 27C18.5 14 16 7 12 2Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.6"/>
        <rect x="8" y="9" width="8" height="3" rx="0.5" fill="#0f172a" stroke="${strokeColor}" stroke-width="0.8"/>
        <rect x="8" y="13.5" width="8" height="3" rx="0.5" fill="#0f172a" stroke="${strokeColor}" stroke-width="0.8"/>
        <rect x="8" y="18" width="8" height="3" rx="0.5" fill="#0f172a" stroke="${strokeColor}" stroke-width="0.8"/>
        <rect x="8.5" y="25" width="7" height="4" rx="1" fill="${strokeColor}"/>
      </svg>
    `;
  } else if (typeLower.includes('fishing')) {
    // Fishing vessel: shorter, wide beam, forward wheelhouse, aft deck
    return `
      <svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 2C7.5 6 5 11 5 21C5 24.5 7.5 26.5 11 26.5C14.5 26.5 17 24.5 17 21C17 11 14.5 6 11 2Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.6"/>
        <rect x="8" y="9" width="6" height="4" rx="1" fill="${strokeColor}"/>
        <line x1="11" y1="16" x2="11" y2="23" stroke="${strokeColor}" stroke-width="1.2"/>
        <line x1="7" y1="21" x2="15" y2="21" stroke="${strokeColor}" stroke-width="1.2"/>
      </svg>
    `;
  } else if (typeLower.includes('bulk')) {
    // Bulk carrier: long hull, distinctive square hatch covers
    return `
      <svg width="24" height="34" viewBox="0 0 24 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8 7 6 13 6 27C6 29.5 8.5 31.5 12 31.5C15.5 31.5 18 29.5 18 27C18 13 16 7 12 2Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.6"/>
        <rect x="9" y="8" width="6" height="3" rx="0.5" fill="${strokeColor}" opacity="0.85"/>
        <rect x="9" y="12.5" width="6" height="3" rx="0.5" fill="${strokeColor}" opacity="0.85"/>
        <rect x="9" y="17" width="6" height="3" rx="0.5" fill="${strokeColor}" opacity="0.85"/>
        <rect x="9" y="21.5" width="6" height="3" rx="0.5" fill="${strokeColor}" opacity="0.85"/>
        <rect x="8.5" y="26" width="7" height="3.5" rx="0.8" fill="${strokeColor}"/>
      </svg>
    `;
  } else {
    // General Cargo / Commercial Ship
    return `
      <svg width="22" height="32" viewBox="0 0 22 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 2C7.5 6.5 5.5 12.5 5.5 25C5.5 28 8 30 11 30C14 30 16.5 28 16.5 25C16.5 12.5 14.5 6.5 11 2Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        <rect x="8.5" y="9" width="5" height="3" rx="0.6" fill="${strokeColor}" opacity="0.85"/>
        <rect x="8.5" y="15" width="5" height="3" rx="0.6" fill="${strokeColor}" opacity="0.85"/>
        <rect x="8" y="22" width="6" height="4" rx="0.8" fill="${strokeColor}"/>
      </svg>
    `;
  }
}

export const InvestigationMap: React.FC<InvestigationMapProps> = ({
  result,
  selectedCandidate,
  onSelectCandidate
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [activeBasemap, setActiveBasemap] = useState<BasemapType>('satellite');

  // Layer visibility state toggles
  const [showSpill, setShowSpill] = useState<boolean>(true);
  const [showDrift, setShowDrift] = useState<boolean>(true);
  const [showVessels, setShowVessels] = useState<boolean>(true);
  const [showTracks, setShowTracks] = useState<boolean>(true);
  const [showCpa, setShowCpa] = useState<boolean>(true);

  // Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: [32.50, 30.20],
      zoom: 8,
      zoomControl: false,
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    const config = BASEMAP_CONFIGS[activeBasemap];
    const tileLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
    });

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    const layerGroup = L.layerGroup().addTo(map);
    layerGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // Switch Basemap Tile Layer dynamically
  const switchBasemap = (type: BasemapType) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    setActiveBasemap(type);

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const config = BASEMAP_CONFIGS[type];
    const newTileLayer = L.tileLayer(config.url, {
      attribution: config.attribution,
      maxZoom: config.maxZoom,
    });

    newTileLayer.addTo(map);
    tileLayerRef.current = newTileLayer;
  };

  // Update Map Layers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    if (!result) return;

    const spill = result.spill_detection;
    const hindcast = result.hindcast;
    const ais = result.ais_attribution;
    const obs = result.investigation.observation;

    const allInvestigationPoints: L.LatLngExpression[] = [];

    // 1. Observation Incident Point (Starting Point of Drift)
    if (obs) {
      const obsLatLng = L.latLng(obs.latitude, obs.longitude);
      allInvestigationPoints.push(obsLatLng);

      const obsMarker = L.circleMarker(obsLatLng, {
        radius: 8,
        color: '#ffffff',
        fillColor: '#10b981', // Emerald green
        fillOpacity: 0.95,
        weight: 2.5
      }).addTo(layerGroup);

      obsMarker.bindPopup(`
        <div style="font-family: inherit;">
          <div style="font-weight: 700; color: #10b981; margin-bottom: 4px;">Incident Observation Point</div>
          <div style="font-size: 11px; color: #cbd5e1;">Lat: ${obs.latitude.toFixed(5)}°N</div>
          <div style="font-size: 11px; color: #cbd5e1;">Lon: ${obs.longitude.toFixed(5)}°E</div>
          <div style="font-size: 11px; color: #cbd5e1;">Time: ${obs.timestamp}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 3px;">Source: ${obs.location_source}</div>
        </div>
      `);
    }

    // 2. Hindcast 24h Backward Drift Path & Directional Chevrons
    if (showDrift && hindcast?.trajectory && hindcast.trajectory.length > 0) {
      const trajectoryLatLngs = hindcast.trajectory.map(
        pt => [pt.latitude, pt.longitude] as [number, number]
      );

      trajectoryLatLngs.forEach(latlng => allInvestigationPoints.push(L.latLng(latlng[0], latlng[1])));

      L.polyline(trajectoryLatLngs, {
        color: '#06b6d4',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.9
      }).addTo(layerGroup).bindPopup(`
        <div style="font-family: inherit;">
          <div style="font-weight: 700; color: #06b6d4; margin-bottom: 4px;">24h Backward Drift Trajectory</div>
          <div style="font-size: 11px; color: #cbd5e1;">Backtrack Duration: ${hindcast.trajectory.length} hours</div>
          <div style="font-size: 11px; color: #94a3b8;">Forcing: ERA5 10m Wind + CMEMS Current</div>
        </div>
      `);

      // Add directional chevron indicators pointing backward along drift trajectory
      for (let i = 0; i < trajectoryLatLngs.length - 1; i += 4) {
        const p1 = trajectoryLatLngs[i];
        const p2 = trajectoryLatLngs[i + 1];
        const bearing = calculateBearing(p1[0], p1[1], p2[0], p2[1]);

        const arrowIcon = L.divIcon({
          className: 'trajectory-arrow-icon',
          html: `<div class="trajectory-arrow" style="transform: rotate(${bearing}deg); color: #06b6d4;">▲</div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });

        L.marker([p1[0], p1[1]], { icon: arrowIcon, interactive: false }).addTo(layerGroup);
      }
    }

    // 3. Probable Origin Region (95% Confidence Bounding Box & Uncertainty Area)
    if (hindcast?.probable_origin_region) {
      const { min_latitude, max_latitude, min_longitude, max_longitude } = hindcast.probable_origin_region;
      const corner1 = L.latLng(min_latitude, min_longitude);
      const corner2 = L.latLng(max_latitude, max_longitude);

      allInvestigationPoints.push(corner1);
      allInvestigationPoints.push(corner2);

      const rect = L.rectangle(L.latLngBounds(corner1, corner2), {
        color: '#06b6d4',
        fillColor: '#06b6d4',
        fillOpacity: 0.16,
        weight: 1.5,
        dashArray: '4, 4'
      }).addTo(layerGroup);

      rect.bindPopup(`
        <div style="font-family: inherit;">
          <div style="font-weight: 700; color: #06b6d4; margin-bottom: 4px;">95% Probable Origin Region</div>
          <div style="font-size: 11px; color: #cbd5e1;">Lat Bounds: ${min_latitude.toFixed(4)}° – ${max_latitude.toFixed(4)}°N</div>
          <div style="font-size: 11px; color: #cbd5e1;">Lon Bounds: ${min_longitude.toFixed(4)}° – ${max_longitude.toFixed(4)}°E</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Monte Carlo Particles: ${hindcast.ensemble_origin.particle_count}</div>
        </div>
      `);
    }

    // 4. Ensemble Mean Origin Point: Distinct Bullseye / Target Icon
    if (hindcast?.ensemble_origin) {
      const originLatLng = L.latLng(hindcast.ensemble_origin.latitude, hindcast.ensemble_origin.longitude);
      allInvestigationPoints.push(originLatLng);

      // Uncertainty circle halo (2500m)
      L.circle(originLatLng, {
        radius: 2500,
        color: '#06b6d4',
        fillColor: '#06b6d4',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '3, 3'
      }).addTo(layerGroup);

      const originIcon = L.divIcon({
        className: 'origin-target-icon',
        html: `
          <div class="origin-target-wrapper" title="Probable Origin (24h Hindcast)">
            <div class="origin-bullseye">
              <div class="origin-center-point"></div>
            </div>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const originMarker = L.marker(originLatLng, { icon: originIcon }).addTo(layerGroup);

      originMarker.bindPopup(`
        <div style="font-family: inherit;">
          <div style="font-weight: 700; color: #06b6d4; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
            <span>🎯 Probable Spill Origin</span>
          </div>
          <div style="font-size: 11px; color: #cbd5e1;">Lat: ${hindcast.ensemble_origin.latitude.toFixed(5)}°N</div>
          <div style="font-size: 11px; color: #cbd5e1;">Lon: ${hindcast.ensemble_origin.longitude.toFixed(5)}°E</div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 3px;">Confidence: <strong>${(hindcast.ensemble_origin.confidence_level * 100).toFixed(0)}%</strong></div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">Estimated Release: ~24h prior to observation</div>
        </div>
      `);
    }

    // 5. Dynamic AIS Candidate Vessels: Trajectories, Rotating Ship Silhouettes & CPA Targets
    if (ais?.ranking && ais.ranking.length > 0) {
      // Sort in reverse order so higher-ranked/selected vessels render visually on top
      const sortedCandidates = [...ais.ranking].reverse();

      sortedCandidates.forEach((vessel) => {
        const isSelected = selectedCandidate?.mmsi === vessel.mmsi;
        const isTop = vessel.rank === 1;

        const trackColor = isSelected ? '#22d3ee' : isTop ? '#f59e0b' : '#38bdf8';
        const trackWeight = isSelected ? 4 : isTop ? 3.5 : 2;
        const trackOpacity = isSelected ? 1.0 : isTop ? 0.95 : 0.45;
        const dashPattern = isTop || isSelected ? undefined : '5, 5';

        // 5a. Trajectory Polyline & Directional Chevrons
        if (showTracks && vessel.trajectory && vessel.trajectory.length > 0) {
          const trackLatLngs = vessel.trajectory.map(
            (pt) => [pt.latitude, pt.longitude] as [number, number]
          );

          trackLatLngs.forEach((latlng) => allInvestigationPoints.push(L.latLng(latlng[0], latlng[1])));

          const polyline = L.polyline(trackLatLngs, {
            color: trackColor,
            weight: trackWeight,
            opacity: trackOpacity,
            dashArray: dashPattern
          }).addTo(layerGroup);

          polyline.on('click', () => {
            if (onSelectCandidate) onSelectCandidate(vessel);
          });

          // Add directional arrow indicators along vessel trajectory
          const arrowStep = Math.max(8, Math.floor(vessel.trajectory.length / 5));
          for (let idx = arrowStep; idx < vessel.trajectory.length - 2; idx += arrowStep) {
            const p1 = vessel.trajectory[idx];
            const p2 = vessel.trajectory[idx + 1];
            const segBearing = calculateBearing(p1.latitude, p1.longitude, p2.latitude, p2.longitude);

            const arrowIcon = L.divIcon({
              className: 'trajectory-arrow-icon',
              html: `<div class="trajectory-arrow" style="transform: rotate(${segBearing}deg); color: ${trackColor}; font-size: ${isTop ? '10px' : '8px'};">▲</div>`,
              iconSize: [12, 12],
              iconAnchor: [6, 6]
            });

            L.marker([p1.latitude, p1.longitude], { icon: arrowIcon, interactive: false }).addTo(layerGroup);
          }
        }

        // 5b. Closest Point of Approach (CPA) Crosshair Target Marker
        const cpaLat = vessel.cpa_latitude ?? (vessel.trajectory && vessel.trajectory.length > 0 ? vessel.trajectory[0].latitude : null);
        const cpaLon = vessel.cpa_longitude ?? (vessel.trajectory && vessel.trajectory.length > 0 ? vessel.trajectory[0].longitude : null);

        if (showCpa && cpaLat !== null && cpaLon !== null) {
          allInvestigationPoints.push(L.latLng(cpaLat, cpaLon));

          const cpaIcon = L.divIcon({
            className: 'maritime-ship-marker',
            html: `
              <div class="cpa-marker-wrapper" title="CPA: ${vessel.minimum_distance_km.toFixed(2)} km">
                <div class="cpa-target-ring">
                  <div class="cpa-center-dot"></div>
                </div>
                <div class="cpa-pill-tag">CPA</div>
              </div>
            `,
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });

          const cpaMarker = L.marker([cpaLat, cpaLon], { icon: cpaIcon }).addTo(layerGroup);

          // Build Dynamic Evidence Checklist HTML for popup
          const evidenceHtml = vessel.evidence_list && vessel.evidence_list.length > 0
            ? vessel.evidence_list.map((ev) => `
                <div style="display: flex; align-items: flex-start; gap: 4px; font-size: 10.5px; color: #cbd5e1; margin-top: 2px;">
                  <span style="color: #10b981; font-weight: bold;">✓</span>
                  <span>${ev}</span>
                </div>
              `).join('')
            : '<div style="font-size: 10px; color: #94a3b8;">No specific anomalies recorded</div>';

          cpaMarker.bindPopup(`
            <div style="font-family: inherit; min-width: 220px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px;">
                <span style="font-weight: 700; color: ${isTop ? '#f59e0b' : '#38bdf8'}; font-size: 12px;">
                  #${vessel.rank} ${vessel.vessel_name}
                </span>
                <span style="font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 600;">
                  ${vessel.ship_type}
                </span>
              </div>
              <div style="font-size: 11px; color: #94a3b8; font-family: monospace; margin-bottom: 4px;">
                MMSI: <strong style="color: #f8fafc;">${vessel.mmsi}</strong>
                ${vessel.callsign ? `· Call: ${vessel.callsign}` : ''}
              </div>
              <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 2px;">
                Attribution Score: <strong style="color: ${vessel.attribution_score_pct >= 70 ? '#f59e0b' : '#38bdf8'};">${vessel.attribution_score_pct.toFixed(1)}%</strong>
              </div>
              <div style="font-size: 10.5px; color: #cbd5e1; margin-bottom: 2px;">
                CPA to Origin: <strong>${vessel.minimum_distance_km.toFixed(2)} km</strong>
              </div>
              <div style="font-size: 10px; color: #94a3b8; margin-bottom: 2px;">
                CPA Time: ${vessel.closest_approach_time.replace('T', ' ').substring(0, 19)}
              </div>
              ${vessel.speed_at_cpa_knots !== undefined && vessel.speed_at_cpa_knots !== null ? `
                <div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px;">
                  Speed at CPA: <strong>${vessel.speed_at_cpa_knots.toFixed(1)} kn</strong>
                </div>
              ` : ''}
              ${vessel.ais_gap_detected ? `
                <div style="font-size: 10px; color: #ef4444; background: rgba(239, 68, 68, 0.12); padding: 2px 4px; border-radius: 3px; margin: 4px 0;">
                  ⚠️ Transponder blackout detected
                </div>
              ` : ''}
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid rgba(148, 163, 184, 0.2);">
                <div style="font-size: 9.5px; font-weight: 600; text-transform: uppercase; color: #94a3b8; margin-bottom: 2px;">
                  Calculated Physical Evidence
                </div>
                ${evidenceHtml}
              </div>
            </div>
          `);

          cpaMarker.on('click', () => {
            if (onSelectCandidate) onSelectCandidate(vessel);
          });
        }

        // 5c. Rotating Vessel Silhouette Icon at Latest / Representative Position
        if (showVessels && vessel.trajectory && vessel.trajectory.length > 0) {
          // Use middle/CPA position or latest waypoint for the ship silhouette icon
          const repIdx = Math.floor(vessel.trajectory.length * 0.5);
          const repPt = vessel.trajectory[repIdx];
          const course = vessel.kinematics?.course_at_cpa_deg ?? repPt.course_deg ?? 0;

          const shipSvgHtml = getShipSvg(vessel.ship_type, isTop, isSelected);

          const shipDivIcon = L.divIcon({
            className: 'maritime-ship-marker',
            html: `
              <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                <div class="ship-icon-wrapper ${isTop ? 'ship-top-suspect' : ''} ${isSelected ? 'ship-selected' : ''}" style="transform: rotate(${course}deg);">
                  ${shipSvgHtml}
                  ${isTop ? '<div class="ship-radar-pulse"></div>' : ''}
                </div>
                ${isTop ? '<div class="ship-badge-label">TOP SUSPECT</div>' : ''}
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          const shipMarker = L.marker([repPt.latitude, repPt.longitude], { icon: shipDivIcon }).addTo(layerGroup);

          shipMarker.bindPopup(`
            <div style="font-family: inherit;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
                <strong style="color: ${isTop ? '#f59e0b' : '#38bdf8'}; font-size: 12px;">
                  #${vessel.rank} ${vessel.vessel_name}
                </strong>
                <span style="font-size: 9px; padding: 1px 4px; border-radius: 3px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 600;">
                  ${vessel.ship_type}
                </span>
              </div>
              <div style="font-size: 11px; color: #cbd5e1; font-family: monospace;">MMSI: ${vessel.mmsi}</div>
              <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">Attribution Score: <strong>${vessel.attribution_score_pct.toFixed(1)}%</strong></div>
              <div style="font-size: 11px; color: #cbd5e1;">Course: <strong>${course.toFixed(0)}°</strong> · Speed: <strong>${repPt.speed_knots} kn</strong></div>
            </div>
          `);

          shipMarker.on('click', () => {
            if (onSelectCandidate) onSelectCandidate(vessel);
          });
        }
      });
    }

    // 6. SAR Spill Centroid & Polygon Footprint
    if (showSpill && spill?.spill_detected && spill.centroid) {
      const spillLatLng = L.latLng(spill.centroid.latitude, spill.centroid.longitude);
      allInvestigationPoints.push(spillLatLng);

      const spillMarker = L.circleMarker(spillLatLng, {
        radius: 9,
        color: '#ffffff',
        fillColor: '#ef4444', // Red
        fillOpacity: 0.95,
        weight: 2.5
      }).addTo(layerGroup);

      spillMarker.bindPopup(`
        <div style="font-family: inherit;">
          <div style="font-weight: 700; color: #ef4444; margin-bottom: 4px;">Detected Oil Spill (U-Net)</div>
          <div style="font-size: 11px; color: #cbd5e1;">Lat: ${spill.centroid.latitude.toFixed(5)}°N</div>
          <div style="font-size: 11px; color: #cbd5e1;">Lon: ${spill.centroid.longitude.toFixed(5)}°E</div>
          ${spill.area_km2 !== null && spill.area_km2 !== undefined ? `<div style="font-size: 11px; color: #cbd5e1;">Area: <strong>${spill.area_km2.toFixed(3)} km²</strong></div>` : ''}
          ${spill.area_pixels ? `<div style="font-size: 11px; color: #94a3b8;">Pixels: ${spill.area_pixels.toLocaleString()} px</div>` : ''}
        </div>
      `);

      if (spill.geojson?.geometry?.coordinates) {
        try {
          const polyCoords = spill.geojson.geometry.coordinates[0].map(
            ([lon, lat]) => [lat, lon] as [number, number]
          );
          const polygon = L.polygon(polyCoords, {
            color: '#ef4444',
            fillColor: '#ef4444',
            fillOpacity: 0.38,
            weight: 2
          }).addTo(layerGroup);
          polygon.bindPopup(`
            <div style="font-family: inherit;">
              <div style="font-weight: 700; color: #ef4444;">Detected Oil Spill Polygon</div>
              <div style="font-size: 11px; color: #cbd5e1;">Area: <strong>${spill.area_km2 ? spill.area_km2.toFixed(3) : 'N/A'} km²</strong></div>
            </div>
          `);
        } catch {
          // Fallback
        }
      }
    }

    // Automatically fit to all relevant points on initial render
    if (allInvestigationPoints.length > 0) {
      map.fitBounds(L.latLngBounds(allInvestigationPoints), { padding: [50, 50], maxZoom: 11 });
    }
  }, [result, selectedCandidate, onSelectCandidate, showSpill, showDrift, showVessels, showTracks, showCpa]);

  const handleFitAll = () => {
    if (!mapInstanceRef.current || !result) return;
    const points: L.LatLngExpression[] = [];

    if (result.investigation.observation) {
      points.push(L.latLng(result.investigation.observation.latitude, result.investigation.observation.longitude));
    }
    if (result.hindcast?.ensemble_origin) {
      points.push(L.latLng(result.hindcast.ensemble_origin.latitude, result.hindcast.ensemble_origin.longitude));
    }
    if (result.spill_detection?.centroid) {
      points.push(L.latLng(result.spill_detection.centroid.latitude, result.spill_detection.centroid.longitude));
    }

    if (points.length > 0) {
      mapInstanceRef.current.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 11 });
    }
  };

  const handleFocusHindcast = () => {
    if (mapInstanceRef.current && result?.hindcast) {
      const hindcast = result.hindcast;
      const bounds: L.LatLngExpression[] = [];

      if (hindcast.probable_origin_region) {
        bounds.push(L.latLng(hindcast.probable_origin_region.min_latitude, hindcast.probable_origin_region.min_longitude));
        bounds.push(L.latLng(hindcast.probable_origin_region.max_latitude, hindcast.probable_origin_region.max_longitude));
      }
      if (hindcast.observation) {
        bounds.push(L.latLng(hindcast.observation.latitude, hindcast.observation.longitude));
      }

      if (bounds.length > 0) {
        mapInstanceRef.current.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 11 });
      }
    }
  };

  const handleFocusCandidate = () => {
    if (!mapInstanceRef.current) return;
    const targetCandidate = selectedCandidate || (result?.ais_attribution?.ranking && result.ais_attribution.ranking[0]);
    if (!targetCandidate) return;

    if (targetCandidate.trajectory && targetCandidate.trajectory.length > 0) {
      const pts = targetCandidate.trajectory.map(
        (p) => L.latLng(p.latitude, p.longitude)
      );
      mapInstanceRef.current.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 12 });
    } else if (targetCandidate.cpa_latitude && targetCandidate.cpa_longitude) {
      mapInstanceRef.current.setView([targetCandidate.cpa_latitude, targetCandidate.cpa_longitude], 12);
    }
  };

  const handleFocusSpill = () => {
    if (mapInstanceRef.current && result?.spill_detection?.centroid) {
      const { latitude, longitude } = result.spill_detection.centroid;
      mapInstanceRef.current.setView([latitude, longitude], 12);
    }
  };

  return (
    <div className="card" style={{ padding: '0.75rem', position: 'relative', overflow: 'hidden' }}>
      {/* Top Map Toolbar: Title, Basemap, Layer Toggles, Focus Buttons */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.25rem 0.5rem 0.6rem 0.5rem',
        borderBottom: '1px solid var(--border-subtle)',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MapIcon size={16} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Maritime Investigation GIS Canvas
          </span>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {/* Basemap Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', backgroundColor: 'var(--bg-input)', padding: '0.15rem 0.3rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-default)' }}>
            <Layers size={12} style={{ color: 'var(--text-muted)', marginLeft: '0.2rem' }} />
            <button
              type="button"
              className={`btn btn-sm ${activeBasemap === 'satellite' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
              onClick={() => switchBasemap('satellite')}
            >
              Satellite
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeBasemap === 'osm' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
              onClick={() => switchBasemap('osm')}
            >
              OSM
            </button>
            <button
              type="button"
              className={`btn btn-sm ${activeBasemap === 'ocean' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
              onClick={() => switchBasemap('ocean')}
            >
              Ocean
            </button>
          </div>

          {/* Quick Focus Actions */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleFitAll}
            title="Fit all investigation layers"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem' }}
          >
            <Maximize2 size={12} style={{ color: 'var(--accent-cyan)' }} /> Fit All
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleFocusHindcast}
            title="Focus Hindcast Probable Origin"
            style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem' }}
          >
            <Focus size={12} style={{ color: 'var(--accent-cyan)' }} /> Origin
          </button>

          {result?.ais_attribution?.ranking && result.ais_attribution.ranking.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleFocusCandidate}
              title="Focus Top Suspect Trajectory"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem' }}
            >
              <Navigation size={12} style={{ color: 'var(--status-warning)' }} /> Focus Suspect
            </button>
          )}

          {result?.spill_detection?.centroid && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleFocusSpill}
              title="Focus SAR Detection Centroid"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem' }}
            >
              <Compass size={12} style={{ color: 'var(--status-danger)' }} /> Spill
            </button>
          )}
        </div>
      </div>

      {/* Layer Visibility Toggle Pills */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.35rem 0.5rem',
        backgroundColor: 'rgba(11, 18, 36, 0.8)',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: '0.7rem',
        flexWrap: 'wrap'
      }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginRight: '0.2rem' }}>
          Layers:
        </span>
        <button
          type="button"
          className={`layer-toggle-btn ${showSpill ? 'active' : ''}`}
          onClick={() => setShowSpill(!showSpill)}
        >
          {showSpill ? <Eye size={11} /> : <EyeOff size={11} />}
          Spill Polygon
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showDrift ? 'active' : ''}`}
          onClick={() => setShowDrift(!showDrift)}
        >
          {showDrift ? <Eye size={11} /> : <EyeOff size={11} />}
          24h Drift
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showTracks ? 'active' : ''}`}
          onClick={() => setShowTracks(!showTracks)}
        >
          {showTracks ? <Eye size={11} /> : <EyeOff size={11} />}
          Vessel Tracks
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showVessels ? 'active' : ''}`}
          onClick={() => setShowVessels(!showVessels)}
        >
          {showVessels ? <Eye size={11} /> : <EyeOff size={11} />}
          Ship Icons
        </button>
        <button
          type="button"
          className={`layer-toggle-btn ${showCpa ? 'active' : ''}`}
          onClick={() => setShowCpa(!showCpa)}
        >
          {showCpa ? <Eye size={11} /> : <EyeOff size={11} />}
          CPA Markers
        </button>
      </div>

      {/* Map Canvas Container */}
      <div
        ref={mapContainerRef}
        style={{
          height: '470px',
          width: '100%',
          borderRadius: 'var(--radius-sm)',
          marginTop: '0.4rem',
          backgroundColor: '#0a101f'
        }}
      />

      {/* Maritime GIS Legend */}
      <div style={{
        position: 'absolute',
        bottom: '1.25rem',
        left: '1.25rem',
        zIndex: 1000,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.65rem 0.85rem',
        fontSize: '0.725rem',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
        maxWidth: '300px'
      }}>
        <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.04em' }}>
          Maritime Investigation Layers
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10b981', border: '1px solid #fff', display: 'inline-block' }} />
            <span style={{ color: '#f8fafc' }}>Observation Incident Point</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid #06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.3)', display: 'inline-block' }} />
            <span style={{ color: '#f8fafc' }}>🎯 Probable Spill Origin (95% CI)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '14px', height: '0px', borderTop: '2px dashed #06b6d4', display: 'inline-block' }} />
            <span style={{ color: '#f8fafc' }}>24h Backward Drift Path</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '14px', height: '0px', borderTop: '3px solid #f59e0b', display: 'inline-block' }} />
            <span style={{ color: '#f8fafc' }}>🟠 Top Suspect Trajectory (#1)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '14px', height: '0px', borderTop: '2px dashed #38bdf8', display: 'inline-block' }} />
            <span style={{ color: '#f8fafc' }}>Candidate Vessel Tracks</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', border: '1.5px dashed #f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.3)', display: 'inline-block' }} />
            <span style={{ color: '#f8fafc' }}>⭕ Closest Point of Approach (CPA)</span>
          </div>
          {result?.spill_detection?.centroid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ef4444', border: '1px solid #fff', display: 'inline-block' }} />
              <span style={{ color: '#f8fafc' }}>🔴 Detected Oil Spill ({result.spill_detection.centroid.latitude.toFixed(2)}°N, {result.spill_detection.centroid.longitude.toFixed(2)}°E)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvestigationMap;
