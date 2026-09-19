import React, { useState } from 'react';
import { X, MapPin, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';

const inputClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]';
const inputStyle = { backgroundColor: 'var(--color-bg-base)', borderColor: 'var(--color-border-default)', color: 'var(--color-text-primary)' };
const labelClass = 'mb-1 block text-xs font-medium';
const labelStyle = { color: 'var(--color-text-secondary)' };

const LOCATION_TYPES = ['OFFICE', 'BRANCH', 'WAREHOUSE', 'CLIENT_SITE', 'FIELD_SITE'];

/**
 * Create or edit an AttendanceLocation. "Use Current Location" (spec §13)
 * only ever FILLS the latitude/longitude/accuracy fields for review — it
 * never saves anything by itself; the admin must still review and press
 * Save/Add explicitly.
 */
const LocationFormModal = ({ mode = 'create', initialLocation, submitting, onCancel, onSubmit }) => {
  const [name, setName] = useState(initialLocation?.name || '');
  const [type, setType] = useState(initialLocation?.type || 'OFFICE');
  const [latitude, setLatitude] = useState(initialLocation?.location?.coordinates?.[1] ?? '');
  const [longitude, setLongitude] = useState(initialLocation?.location?.coordinates?.[0] ?? '');
  const [allowedRadiusMeters, setAllowedRadiusMeters] = useState(initialLocation?.allowedRadiusMeters ?? 100);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [locateError, setLocateError] = useState(null);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocateError('Geolocation is not supported by this browser.');
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude.toFixed(6));
        setLongitude(position.coords.longitude.toFixed(6));
        setAccuracy(Math.round(position.coords.accuracy));
        setLocating(false);
      },
      (error) => {
        setLocateError(error.message || 'Could not fetch your current location.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({
      name, type, latitude: Number(latitude), longitude: Number(longitude),
      allowedRadiusMeters: Number(allowedRadiusMeters)
    });
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onCancel}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--color-bg-base)' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>{mode === 'create' ? 'Add Location' : 'Edit Location'}</h2>
          <button type="button" onClick={onCancel} className="rounded-lg p-1.5 hover:bg-[var(--color-bg-muted)]"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>Location name</label>
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Head Office" required />
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>Type</label>
          <select className={inputClass} style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
            {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>

        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation} disabled={locating} className="flex w-full items-center justify-center gap-2">
            {locating ? <><Loader2 className="h-4 w-4 animate-spin" /> Locating…</> : <><MapPin className="h-4 w-4" /> Use Current Location</>}
          </Button>
          {locateError && <p className="mt-2 text-xs" style={{ color: 'var(--color-error-text)' }}>{locateError}</p>}
          {accuracy != null && !locateError && (
            <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>Captured with ±{accuracy}m accuracy. Review the coordinates below before saving.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelClass} style={labelStyle}>Latitude</label><input type="number" step="0.000001" min="-90" max="90" className={inputClass} style={inputStyle} value={latitude} onChange={(e) => setLatitude(e.target.value)} required /></div>
          <div><label className={labelClass} style={labelStyle}>Longitude</label><input type="number" step="0.000001" min="-180" max="180" className={inputClass} style={inputStyle} value={longitude} onChange={(e) => setLongitude(e.target.value)} required /></div>
        </div>

        <div>
          <label className={labelClass} style={labelStyle}>Allowed radius (meters)</label>
          <input type="number" min="1" max="50000" className={inputClass} style={inputStyle} value={allowedRadiusMeters} onChange={(e) => setAllowedRadiusMeters(e.target.value)} required />
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>How far from this point an employee may still check in/out.</p>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--color-border-subtle)' }}>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : mode === 'create' ? 'Add Location' : 'Save Changes'}</Button>
        </div>
      </form>
    </div>
  );
};

export default LocationFormModal;
