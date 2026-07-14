import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { fetchVMs, fetchSettings } from '../api';
import type { VM, SettingsResponse } from '../types';

interface VMContextValue {
  vms: VM[];
  jobs: VM[];
  allItems: VM[];
  settings: SettingsResponse | null;
  loading: boolean;
  reload: () => void;
}

const VMContext = createContext<VMContextValue>({
  vms: [],
  jobs: [],
  allItems: [],
  settings: null,
  loading: true,
  reload: () => {},
});

export function VMProvider({ children }: { children: ReactNode }) {
  const [allItems, setAllItems] = useState<VM[]>([]);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetchVMs().then((data) => {
      setAllItems(data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 7000);
    return () => clearInterval(interval);
  }, [load]);

  const vms = allItems.filter(i => i.type === 'vm');
  const jobs = allItems.filter(i => i.type === 'job');

  return (
    <VMContext.Provider value={{ vms, jobs, allItems, settings, loading, reload: load }}>
      {children}
    </VMContext.Provider>
  );
}

export function useVM() {
  return useContext(VMContext);
}
