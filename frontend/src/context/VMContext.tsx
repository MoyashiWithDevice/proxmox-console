import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { fetchVMs, fetchJobs, fetchSettings } from '../api';
import type { VM, SettingsResponse } from '../types';

interface VMContextValue {
  vms: VM[];
  jobs: VM[];
  settings: SettingsResponse | null;
  loading: boolean;
  reload: () => void;
}

const VMContext = createContext<VMContextValue>({
  vms: [],
  jobs: [],
  settings: null,
  loading: true,
  reload: () => {},
});

export function VMProvider({ children }: { children: ReactNode }) {
  const [vms, setVMs] = useState<VM[]>([]);
  const [jobs, setJobs] = useState<VM[]>([]);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      fetchVMs().catch(() => [] as VM[]),
      fetchJobs().catch(() => [] as VM[]),
    ]).then(([vmData, jobData]) => {
      setVMs(vmData || []);
      setJobs(jobData || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 7000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <VMContext.Provider value={{ vms, jobs, settings, loading, reload: load }}>
      {children}
    </VMContext.Provider>
  );
}

export function useVM() {
  return useContext(VMContext);
}
