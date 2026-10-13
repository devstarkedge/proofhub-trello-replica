import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ClientInfoContext = createContext(null);

const normalizeClient = (source = {}, fallback = {}) => {
  const name = source.clientName ?? source.name ?? fallback.name ?? '';
  const email = source.clientEmail ?? source.email ?? fallback.email ?? '';
  const phone = source.clientWhatsappNumber ?? source.phone ?? fallback.phone ?? '';
  return { name, email, phone };
};

export const ClientInfoProvider = ({ children }) => {
  const [clientInfoByProject, setClientInfoByProject] = useState({});

  const upsertClientInfo = useCallback((projectId, source, fallback = {}) => {
    if (!projectId || !source) return;
    setClientInfoByProject(prev => {
      const existing = prev[projectId] || {};
      const normalized = normalizeClient(source, { ...existing, ...fallback });
      if (
        existing.name === normalized.name &&
        existing.email === normalized.email &&
        existing.phone === normalized.phone
      ) {
        return prev;
      }
      return {
        ...prev,
        [projectId]: normalized
      };
    });
  }, []);

  const upsertClientInfoBatch = useCallback((items = []) => {
    if (!items.length) return;
    setClientInfoByProject(prev => {
      let didChange = false;
      const next = { ...prev };
      items.forEach(({ projectId, source, fallback }) => {
        if (!projectId || !source) return;
        const existing = next[projectId] || {};
        const normalized = normalizeClient(source, { ...existing, ...(fallback || {}) });
        if (
          existing.name !== normalized.name ||
          existing.email !== normalized.email ||
          existing.phone !== normalized.phone
        ) {
          next[projectId] = normalized;
          didChange = true;
        }
      });
      return didChange ? next : prev;
    });
  }, []);

  const getClientForProject = useCallback((projectId, fallback = {}) => {
    if (!projectId) return normalizeClient(fallback, fallback);
    const live = clientInfoByProject[projectId];
    if (!live) return normalizeClient(fallback, fallback);
    return normalizeClient(live, fallback);
  }, [clientInfoByProject]);

  const getClientDetailsForProject = useCallback((projectId, fallback = {}) => {
    const live = projectId ? clientInfoByProject[projectId] : null;
    return {
      clientName: live?.name ?? fallback.clientName ?? fallback.name ?? '',
      clientEmail: live?.email ?? fallback.clientEmail ?? fallback.email ?? '',
      clientWhatsappNumber: live?.phone ?? fallback.clientWhatsappNumber ?? fallback.phone ?? ''
    };
  }, [clientInfoByProject]);

  useEffect(() => {
    const handleBoardUpdate = (event) => {
      const { boardId, updates } = event.detail || {};
      if (!boardId || !updates?.clientDetails) return;
      upsertClientInfo(boardId, updates.clientDetails);
    };

    window.addEventListener('socket-board-updated', handleBoardUpdate);
    return () => window.removeEventListener('socket-board-updated', handleBoardUpdate);
  }, [upsertClientInfo]);

  const value = useMemo(() => ({
    clientInfoByProject,
    upsertClientInfo,
    upsertClientInfoBatch,
    getClientForProject,
    getClientDetailsForProject
  }), [clientInfoByProject, upsertClientInfo, upsertClientInfoBatch, getClientForProject, getClientDetailsForProject]);

  return (
    <ClientInfoContext.Provider value={value}>
      {children}
    </ClientInfoContext.Provider>
  );
};

export const useClientInfo = () => {
  const context = useContext(ClientInfoContext);
  if (!context) {
    throw new Error('useClientInfo must be used within a ClientInfoProvider');
  }
  return context;
};
