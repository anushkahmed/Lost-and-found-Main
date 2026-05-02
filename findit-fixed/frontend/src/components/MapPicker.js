import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons in webpack bundle
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) { onPick({ lat: e.latlng.lat, lng: e.latlng.lng }); }
  });
  return null;
}

function Centerer({ center }) {
  const map = useMapEvents({});
  useEffect(() => {
    if (center && map) map.setView([center.lat, center.lng], map.getZoom());
  }, [center, map]);
  return null;
}

export default function MapPicker({ value, onChange, height = 280, defaultCenter = { lat: 23.7806, lng: 90.4193 } }) {
  const center = value && value.lat != null && value.lng != null ? value : defaultCenter;

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  };

  return (
    <div data-no-invert>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          {value && value.lat != null
            ? `📍 ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}`
            : 'Click on the map to drop a pin'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={useMyLocation}
            style={{ background:'#262b3d', color:'#e2e8f0', border:'1px solid rgba(255,255,255,0.08)', padding:'4px 10px', borderRadius:6, fontSize:11, cursor:'pointer' }}>
            📍 Use my location
          </button>
          {value && value.lat != null && (
            <button type="button" onClick={() => onChange(null)}
              style={{ background:'transparent', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.08)', padding:'4px 10px', borderRadius:6, fontSize:11, cursor:'pointer' }}>
              Clear
            </button>
          )}
        </div>
      </div>
      <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
        <MapContainer center={[center.lat, center.lng]} zoom={13} style={{ height, width: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Centerer center={center} />
          <ClickHandler onPick={onChange} />
          {value && value.lat != null && <Marker position={[value.lat, value.lng]} />}
        </MapContainer>
      </div>
    </div>
  );
}
