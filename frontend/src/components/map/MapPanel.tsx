import React, { useEffect, useRef } from 'react';
import type { HotspotsResponse, Region } from '../../api/types';

interface RegionBBoxSimple {
  west: number; east: number; south: number; north: number;
}

interface MapPanelProps {
  region: Region;
  onRegionChange: (r: Region) => void;
  hotspots?: HotspotsResponse | null;
  loading?: boolean;
  dataMode?: 'historical' | 'realtime';
}

function extractBbox(region: Region): RegionBBoxSimple {
  if ('bbox' in region && region.bbox) {
    return region.bbox as RegionBBoxSimple;
  }
  // For polygon, compute bounding box
  if ('polygon' in region && region.polygon) {
    const coords = region.polygon as number[][];
    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    return {
      west: Math.min(...lons),
      east: Math.max(...lons),
      south: Math.min(...lats),
      north: Math.max(...lats),
    };
  }
  return { west: 68.0, east: 75.0, south: 20.0, north: 25.0 };
}

const MapPanel: React.FC<MapPanelProps> = ({
  region,
  onRegionChange,
  hotspots,
  dataMode = 'historical',
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const hotspotsLayerRef = useRef<any>(null);

  const bbox = extractBbox(region);

  useEffect(() => {
    if (!divRef.current) return;
    if (mapRef.current) return; // already initialized

    const L = (window as any).L;
    if (!L) {
      console.error('Leaflet not found on window.L');
      return;
    }

    // Fix default icon paths
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    // Initialize map
    const initBbox = extractBbox(region);
    const map = L.map(divRef.current, {
      center: [22.3, 71.5], // Default: Gujarat, India
      zoom: 7,
      preferCanvas: true,
    });
    mapRef.current = map;

    // OpenStreetMap standard base layer
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    });
    osm.addTo(map);

    // NASA GIBS layer
    const today = new Date().toISOString().slice(0, 10);
    const gibs = L.tileLayer(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${today}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
      {
        attribution: 'NASA GIBS',
        maxZoom: 9,
        opacity: 0.75,
      },
    );

    L.control.layers({ 'OpenStreetMap': osm, 'NASA Satellite (MODIS)': gibs }, {}).addTo(map);

    // Drawn items feature group
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    layerRef.current = drawnItems;

    // Draw control
    if (L.Control && L.Control.Draw) {
      const drawControl = new L.Control.Draw({
        draw: {
          rectangle: {
            shapeOptions: {
              color: '#1F4E79',
              weight: 2,
              dashArray: '5,5',
              fillOpacity: 0.08,
            },
          },
          polygon: {
            shapeOptions: {
              color: '#1F4E79',
              weight: 2,
              fillOpacity: 0.08,
            },
          },
          circle: false,
          circlemarker: false,
          marker: false,
          polyline: false,
        },
        edit: { featureGroup: drawnItems },
      });
      map.addControl(drawControl);
    }

    // Handle drawn shapes
    const updateFromRectLayer = (layer: any) => {
      const b = layer.getBounds();
      onRegionChange({
        bbox: {
          west: parseFloat(b.getWest().toFixed(4)),
          east: parseFloat(b.getEast().toFixed(4)),
          south: parseFloat(b.getSouth().toFixed(4)),
          north: parseFloat(b.getNorth().toFixed(4)),
        },
      });
    };

    const updateFromPolyLayer = (layer: any) => {
      const latlngs: any[] = layer.getLatLngs()[0];
      const coords = latlngs.map((ll: any) => [ll.lng, ll.lat]);
      // Close polygon
      if (coords.length > 0) coords.push(coords[0]);
      onRegionChange({ polygon: coords });
    };

    map.on('draw:created', (e: any) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      if (e.layerType === 'rectangle') {
        updateFromRectLayer(e.layer);
      } else if (e.layerType === 'polygon') {
        updateFromPolyLayer(e.layer);
      }
    });

    map.on('draw:edited', (e: any) => {
      e.layers.eachLayer((layer: any) => {
        if (layer instanceof L.Rectangle) {
          updateFromRectLayer(layer);
        } else if (layer instanceof L.Polygon) {
          updateFromPolyLayer(layer);
        }
      });
    });

    // Draw initial region rectangle
    const drawRect = (b: RegionBBoxSimple) => {
      drawnItems.clearLayers();
      const rect = L.rectangle(
        [[b.south, b.west], [b.north, b.east]],
        { color: '#1F4E79', weight: 2, dashArray: '5,5', fillOpacity: 0.08 },
      );
      drawnItems.addLayer(rect);
    };
    drawRect(initBbox);

    // Hotspots layer placeholder
    hotspotsLayerRef.current = L.layerGroup().addTo(map);

    // Fit to initial bbox (Gujarat default)
    map.fitBounds([[initBbox.south, initBbox.west], [initBbox.north, initBbox.east]], {
      padding: [25, 25],
    });

    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
        mapRef.current.fitBounds([[initBbox.south, initBbox.west], [initBbox.north, initBbox.east]], {
          padding: [25, 25],
        });
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to bounds when region prop changes externally (e.g. country selector)
  useEffect(() => {
    if (!mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const b = extractBbox(region);
    if (b.west === b.east || b.south === b.north) return;

    mapRef.current.flyToBounds([[b.south, b.west], [b.north, b.east]], {
      padding: [30, 30],
      duration: 0.8,
    });

    // Redraw rectangle on the drawn-items layer
    if (layerRef.current) {
      layerRef.current.clearLayers();
      const rect = L.rectangle(
        [[b.south, b.west], [b.north, b.east]],
        { color: '#1F4E79', weight: 2, dashArray: '5,5', fillOpacity: 0.08 },
      );
      layerRef.current.addLayer(rect);
    }
  }, [
    (region as any).bbox?.west,
    (region as any).bbox?.east,
    (region as any).bbox?.south,
    (region as any).bbox?.north,
  ]);

  // Render hotspot points when hotspots data changes
  useEffect(() => {
    if (!mapRef.current || !hotspotsLayerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    hotspotsLayerRef.current.clearLayers();
    if (!hotspots || !hotspots.points.length) return;

    const zoom = mapRef.current.getZoom();
    const shouldShowPoints = hotspots.total_in_region < 500 || zoom >= 10;

    if (shouldShowPoints) {
      hotspots.points.forEach((pt) => {
        const color = pt.sensor === 'MODIS' ? '#E05C1A' : '#1A6DE0';
        const circle = L.circleMarker([pt.lat, pt.lon], {
          radius: 4,
          color,
          fillColor: color,
          fillOpacity: 0.7,
          weight: 1,
        });
        circle.bindPopup(
          `<strong>${pt.sensor}</strong> (${pt.satellite})<br/>` +
          `Date: ${pt.date}<br/>` +
          `FRP: ${pt.frp.toFixed(1)} MW<br/>` +
          `Confidence: ${pt.confidence}`,
        );
        hotspotsLayerRef.current.addLayer(circle);
      });
    }
  }, [hotspots]);

  const truncationMsg = hotspots?.truncated
    ? `Showing ${hotspots.points.length.toLocaleString()} of ${hotspots.total_in_region.toLocaleString()} hotspots (truncated)`
    : null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Map label bar */}
      <div style={{
        padding: '6px 12px',
        background: 'var(--panel)',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span>
          {dataMode === 'realtime' ? 'Near Real-Time Fire Hotspots' : 'Region Selection'} : Interactive Map
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400, fontSize: 11 }}>
          Draw a rectangle or polygon to select a region
        </span>
      </div>

      {/* Truncation notice */}
      {truncationMsg && (
        <div style={{
          position: 'absolute',
          top: 36,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          padding: '3px 12px',
          fontSize: 11,
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {truncationMsg}
        </div>
      )}

      {/* Leaflet map div — must have concrete height */}
      <div ref={divRef} style={{ flex: 1, minHeight: 0 }} />

      {/* Legend */}
      {hotspots && hotspots.points.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          right: 8,
          zIndex: 1000,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          padding: '6px 10px',
          fontSize: 11,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sensor
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#E05C1A' }} />
            MODIS
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#1A6DE0' }} />
            VIIRS
          </div>
        </div>
      )}
    </div>
  );
};

export default MapPanel;
