import { useState, useCallback } from 'react';

const API_BASE = '/api';

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const upload = useCallback(async (file) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const predictSingle = useCallback(async (patient) => {
    return request('/predict_single', { method: 'POST', body: JSON.stringify(patient) });
  }, [request]);

  const overview = useCallback(() => request('/overview'), [request]);
  const members = useCallback((risk = 'ALL', q = '') => 
    request(`/members?risk=${risk}&q=${encodeURIComponent(q)}`), [request]);
  const member = useCallback((id) => request(`/member/${id}`), [request]);
  const impact = useCallback((success) => request(`/impact?success=${success}`), [request]);
  const reset = useCallback(() => request('/reset', { method: 'POST' }), [request]);
  const download = useCallback((fname) => `${API_BASE}/download/${fname}`, []);

  return { loading, error, upload, predictSingle, overview, members, member, impact, reset, download };
}