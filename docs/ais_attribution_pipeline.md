# AIS Vessel Attribution Pipeline & Real AIS Integration Guide

## 1. Overview & Architecture

The SIH PS 26143 AIS Attribution Engine correlates SAR-detected oil spill footprints and Lagrangian backward hindcast trajectories with maritime AIS data to evaluate and rank candidate vessels using multi-factor physical evidence.

```
SAR Detection & Segmentation (U-Net)
               ↓
Spill Footprint & Centroid (GeoJSON)
               ↓
Lagrangian Environmental Hindcast (ERA5 Wind + CMEMS Currents)
               ↓
Probable Spill Origin (Lat, Lon) & Estimated Release Window
               ↓
AIS Source Resolution (Auto Context-Aware, Benchmark CSV, or Uploaded Real AIS)
               ↓
Trajectory Reconstruction & Temporal Sorting
               ↓
Spatio-Temporal & Corridor Filtering (50 km candidate threshold)
               ↓
Kinematic & Anomaly Feature Extraction (CPA, Timing, Alignment, Speeds, Gaps)
               ↓
Transparent Weighted Attribution Scoring (0% – 100% Evidence Score)
               ↓
Dynamic Rule-Based Explainability (Physical Evidence Checklist)
               ↓
Interactive GIS Map (Polylines + Heading Silhouettes + CPA Markers) & Suspect Ranking UI
```

---

## 2. 3-Mode AIS Source Resolution Strategy

To support both realistic generalized demonstrations anywhere on Earth and production real-world operations, the pipeline implements three distinct AIS ingestion modes:

### Mode A: Real / Custom AIS (Uploaded or Configured)
- **Trigger**: An AIS CSV file is uploaded via `POST /api/v1/investigate` (`ais_file`), `POST /api/v1/ais/upload-and-analyze`, or `ais_source="custom"`.
- **Behavior**: Validates schema compliance, parses timestamps with flexible ISO parsing (`format="mixed"`), and runs attribution directly against real vessel tracks.
- **Empty State**: If no vessels in the file fall within the spatial threshold (50 km) or temporal window, the pipeline honestly returns 0 candidates and displays:
  > *"No relevant vessels found in the selected spatial-temporal window."*

### Mode B: Persistent Benchmark AIS
- **Trigger**: `ais_source="benchmark"` or explicitly requesting the baseline Mediterranean dataset.
- **Behavior**: Loads `backend/data/synthetic_ais.csv` (originating around ~32.2°N, ~30.0°E).
- **Benchmark Preservation**: The physical file `backend/data/synthetic_ais.csv` is preserved as an immutable benchmark dataset for regression and standardization tests.

### Mode C: Context-Aware Dynamic Generation (Default / "Auto")
- **Trigger**: `ais_source="auto"` when no custom AIS file is uploaded.
- **Geographic Awareness**: If the hindcast origin is near the benchmark Mediterranean coordinates (`31.5°N - 33.5°N`, `29.0°E - 31.0°E`), it seamlessly utilizes the benchmark. If the investigation is located elsewhere (e.g. North Sea `55.25°N`, `5.81°E`), it dynamically generates 5 realistic vessel profiles in-memory matching the local latitude/longitude and hindcast release timestamp.
- **Zero File Overwrite**: Generated data is handled strictly in-memory without overwriting `synthetic_ais.csv`.

---

## 3. Physical Kinematics & CPA Geometry

The context-aware generator creates mathematically sound trajectories scaled for any latitude:

1. **Latitude Metric Scaling**:
   Longitude distances are scaled by $\cos(\text{lat}_{\text{rad}})$:
   $$\Delta \text{lat} = \frac{d_y}{111.0}, \quad \Delta \text{lon} = \frac{d_x}{111.0 \cdot \max(0.2, \cos(\text{lat}_{\text{rad}}))}$$
2. **Exact Perpendicular CPA Geometry**:
   To ensure the vessel's point of closest approach matches the intended distance $d_{\text{cpa}}$ without trajectory kinking:
   $$\hat{u}_{\text{vessel}} = (\sin \theta, \cos \theta), \quad \hat{n} = (\cos \theta, -\sin \theta)$$
   $$\vec{r}_{\text{cpa}} = d_{\text{cpa}} \cdot \hat{n}$$
   The trajectory position at time $t$ relative to CPA time $t_{\text{cpa}}$ with speed $v$ is:
   $$\vec{r}(t) = \vec{r}_{\text{cpa}} + v \cdot (t - t_{\text{cpa}}) \cdot \hat{u}_{\text{vessel}}$$
3. **Regular Temporal Sampling**:
   Vessel waypoints are sampled on exact 12-minute intervals ($\pm 4.0$ hours) yielding smooth, continuous tracks for GIS rendering.

---

## 4. AIS Dataset Schema

The normalized schema required for custom AIS data:

| Column | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `mmsi` | Integer | Yes | Maritime Mobile Service Identity (9 digits) |
| `latitude` | Float | Yes | WGS84 latitude (-90.0 to 90.0) |
| `longitude` | Float | Yes | WGS84 longitude (-180.0 to 180.0) |
| `timestamp` | ISO-8601 String | Yes | UTC timestamp (e.g. `2019-10-19T06:48:00Z` or `2019-10-19 06:48:00`) |
| `vessel_name` | String | No | Vessel name (e.g. `MT Ocean Voyager`) |
| `vessel_type` | String | No | Vessel category (Tanker, Cargo, Fishing, etc.) |
| `speed` | Float | No | Speed over ground in knots |
| `course` | Float | No | Course over ground in degrees (0–360) |
| `heading` | Integer | No | Vessel true heading (0–359) |
| `imo` | Integer | No | International Maritime Organization ship ID |
| `callsign` | String | No | Radio callsign |
| `navigation_status` | String | No | Navigational status string |
| `destination` | String | No | Destination port |
| `draught` | Float | No | Maximum present static draught in meters |

---

## 5. Multi-Factor Attribution Scoring Formula

The final **Attribution Evidence Score** $S \in [0\%, 100\%]$ is a weighted composite of 5 normalized component scores:

$$S = 100 \times \left( w_{\text{prox}} \cdot s_{\text{prox}} + w_{\text{temp}} \cdot s_{\text{temp}} + w_{\text{align}} \cdot s_{\text{align}} + w_{\text{behav}} \cdot s_{\text{behav}} + w_{\text{gap}} \cdot s_{\text{gap}} \right)$$

### Default Weights (`backend/app/core/config.py`):
- **$w_{\text{prox}} = 0.30$ (Spatial Proximity)**: Non-linear decay $s_{\text{prox}} = \max\left(0, 1 - \frac{d_{\text{cpa}}}{25.0}\right)^{1.5}$
- **$w_{\text{temp}} = 0.25$ (Temporal Window Match)**: Linear decay $s_{\text{temp}} = \max\left(0, 1 - \frac{|\Delta t|}{T_{\text{window}}}\right)$
- **$w_{\text{align}} = 0.20$ (Trajectory Alignment)**: Directional consistency with origin approach/departure corridor.
- **$w_{\text{behav}} = 0.15$ (Kinematic Behavior)**: Speed deceleration or loitering near origin.
- **$w_{\text{gap}} = 0.10$ (Transponder Blackout)**: AIS transmission gap $> 25\text{ min}$ near origin.

> **Investigative Terminology Standard**: The pipeline strictly uses the phrasing:
> *"Ranked Suspect Vessels based on available spatio-temporal evidence"*
> It deliberately avoids deterministic legal accusations such as *"Culprit Vessel"* or *"Probability of guilt"*.

---

## 6. Dynamic Explainability & Evidence Generation

Evidence items are generated dynamically from computed kinematic features:
- **Spatial**: `"Direct origin pass: 0.10 km CPA to probable release center"`
- **Temporal**: `"Strong temporal match: present at CPA within 48 min of release window"`
- **Directional**: `"Continuous corridor transit: converged on and departed from origin vicinity (COG 47°)"`
- **Kinematic**: `"Significant speed reduction near origin: dropped from 13.2 kn to 5.1 kn"`
- **Anomaly**: `"AIS transponder blackout detected: 48 min gap near release area"`

---

## 7. API Endpoints

### 1. `POST /api/v1/investigate` (Master Pipeline)
Multipart form request:
- `sar_file` (UploadFile, required): Sentinel-1 SAR GeoTIFF.
- `ais_file` (UploadFile, optional): Custom AIS CSV.
- `ais_source` (Form string, optional): `"auto"`, `"benchmark"`, or `"custom"`.
- `time_window_hours` (Form float, default 12.0): Temporal correlation window.
- `wind_speed`, `wind_direction`, `current_speed`, `current_direction`: Environmental hindcast parameters.

Response includes:
- `ais_attribution`: `AISAttributionResult` with `ranking` (list of candidate vessels), `top_candidate` (`ranking[0]` or `None`), `time_window_hours`, `search_radius_km`, and `ais_data_source`.

### 2. `POST /api/v1/ais/analyze`
JSON request:
```json
{
  "origin_latitude": 55.251,
  "origin_longitude": 5.812,
  "observation_time": "2023-08-15T14:30:00Z",
  "estimated_spill_time": "2023-08-15T08:30:00Z",
  "spatial_threshold_km": 50.0,
  "time_window_hours": 12.0,
  "ais_source": "auto"
}
```

### 3. `POST /api/v1/ais/upload-and-analyze`
Multipart CSV upload endpoint for standalone custom AIS analysis.

---

## 8. Frontend Integration

1. **Investigation Form (`InvestigationForm.tsx`)**:
   - Allows users to select between **Auto (Context-Aware)**, **Benchmark Dataset**, and **Upload Custom AIS CSV**.
   - Handles file upload seamlessly with `FormData` submission.
2. **Top Candidate Card (`ResultSummary.tsx`)**:
   - Dynamically binds to `investigation.ais_attribution.top_candidate`.
   - Displays vessel name, MMSI, type, attribution score bar, CPA distance, time delta, and physical evidence points.
   - Shows badge indicating data source (`Auto Synthetic`, `Benchmark AIS`, `Real AIS`).
   - If 0 vessels qualify in real mode, gracefully states: `"No relevant vessels found in the selected spatial-temporal window."`
3. **Ranked Suspect Vessels Table (`VesselRanking.tsx`)**:
   - Lists all evaluated vessels sorted by composite attribution score.
   - Interactive selection highlights vessel track and zooms the map.
4. **Interactive GIS Map (`InvestigationMap.tsx`)**:
   - Visualizes SAR footprint, hindcast drift particles, and probable spill origin.
   - Renders complete vessel trajectories with gold accent for top candidate.
   - Displays directional SVG ship silhouettes oriented by true heading.
   - Places interactive CPA markers with popups detailing kinematic anomalies.
