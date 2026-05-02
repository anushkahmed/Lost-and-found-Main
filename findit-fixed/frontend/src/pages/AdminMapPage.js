import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../context/AuthContext';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const T = {
  card:   '#1a2e20',
  border: 'rgba(74,124,111,0.22)',
  text:   '#daeee6',
  muted:  '#6b8f7a',
  high:   '#b8d4c8',
};

const COLOR = {
  found:    '#4a7c6f',
  claimed:  '#fbbf24',
  returned: '#34d399',
  expired:  '#94a3b8',
  archived: '#64748b',
};

// Group nearby points by rounding lat/lng to ~110m so circles can be sized by density
const roundKey = (lat, lng) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

export default function AdminMapPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]         = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    axios.get('/api/items/meta/heatmap')
      .then(({ data }) => setItems(data))
      .catch(err => setMsg('❌ ' + (err.response?.data?.message || 'Failed to load')))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const buckets = useMemo(() => {
    const map = new Map();
    items.forEach(it => {
      const k = roundKey(it.coordinates.lat, it.coordinates.lng);
      const b = map.get(k) || { lat: it.coordinates.lat, lng: it.coordinates.lng, items: [] };
      b.items.push(it);
      map.set(k, b);
    });
    return Array.from(map.values());
  }, [items]);

  const center = useMemo(() => {
    if (items.length === 0) return [23.7806, 90.4193];
    const lat = items.reduce((s, i) => s + i.coordinates.lat, 0) / items.length;
    const lng = items.reduce((s, i) => s + i.coordinates.lng, 0) / items.length;
    return [lat, lng];
  }, [items]);

  if (!isAdmin) return <div style={{ padding: '2rem', color: T.text }}>Admin only.</div>;

  return (
    <div style={{ padding: '24px 28px', color: T.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0, color: T.high, fontSize: 22 }}>🗺 Loss & Found Heatmap</h2>
          <div style={{ color: T.muted, fontSize: 13, marginTop: 4 }}>
            Density of pin-dropped items across campus. Larger circles = more items in that spot.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: T.muted }}>
          {Object.entries(COLOR).map(([k, c]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />
              {k}
            </span>
          ))}
        </div>
      </div>

      {msg && <div style={{ color: '#f87171', marginBottom: 12 }}>{msg}</div>}
      {loading && <div style={{ color: T.muted }}>Loading…</div>}

      {!loading && items.length === 0 && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, color: T.muted, textAlign: 'center' }}>
          No items have been pin-dropped on the map yet. Posters can drop a pin when posting a found item.
        </div>
      )}

      {!loading && items.length > 0 && (
        <div data-no-invert style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          <MapContainer center={center} zoom={14} style={{ height: 540, width: '100%' }}>
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {buckets.map(b => {
              const radius = Math.min(40, 8 + b.items.length * 4);
              const dominant = b.items[0]?.status || 'found';
              return (
                <CircleMarker key={`${b.lat},${b.lng}`} center={[b.lat, b.lng]} radius={radius}
                  pathOptions={{
                    color: COLOR[dominant] || COLOR.found,
                    fillColor: COLOR[dominant] || COLOR.found,
                    fillOpacity: 0.45,
                    weight: 2,
                  }}>
                  <Tooltip direction="top">
                    {b.items.length} item{b.items.length !== 1 ? 's' : ''}
                  </Tooltip>
                  <Popup>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>
                      {b.items.length} item{b.items.length !== 1 ? 's' : ''} here
                    </div>
                    <ul style={{ paddingLeft: 16, margin: 0, fontSize: 12, maxHeight: 160, overflow: 'auto' }}>
                      {b.items.slice(0, 12).map(it => (
                        <li key={it._id}>
                          <strong>{it.name}</strong> ({it.status})
                          <div style={{ color: '#6b7280', fontSize: 11 }}>{it.foundLocation}</div>
                        </li>
                      ))}
                      {b.items.length > 12 && <li>+ {b.items.length - 12} more</li>}
                    </ul>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
