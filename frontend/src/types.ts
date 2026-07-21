export type StatusType = 'running' | 'stopped' | 'paused';

export interface VM {
  type: 'vm' | 'job';
  VMID?: number;
  cpu?: number;
  memory?: number;
  hdd?: number;
  servername?: string;
  Name?: string;
  Servername?: string;
  OS?: string;
  status?: string;
  Status?: string;
  IP?: string;
  JOBID?: string;
  job_id?: string;
  vmid?: number;
  id?: string;
  log?: string;
}

export interface VMRequest {
  vmid?: number;
  name?: string;
  cores?: number;
  memory?: number;
  hdd?: number;
  servername?: string;
  os?: string;
  hostname?: string;
  username?: string;
  runcmd?: string;
}

export interface SettingsResponse {
  cpu: { min: number; max: number; step: number };
  memory: { min: number; max: number; step: number };
  hdd: { min: number; max: number; step: number };
  os: { id: string; label: string; image?: string }[];
}

export interface OSOption {
  id: string;
  label: string;
  image?: string;
}

export interface FlowNode {
  type: string;
  attributes?: {
    type?: string;
    name?: string;
    value?: string;
    required?: boolean;
    autocomplete?: string;
  };
  meta?: {
    label?: {
      text?: string;
    };
  };
}

export interface KratosFlow {
  id: string;
  ui: {
    method: string;
    action: string;
    nodes: FlowNode[];
    messages: { type: string; text: string }[];
  };
  error?: {
    id: string;
    messages: { text: string }[];
  };
}

export const statusColors: Record<string, { dot: string; color: string }> = {
  running: { dot: '#22c55e', color: '#22c55e' },
  done: { dot: '#22c55e', color: '#22c55e' },
  stopped: { dot: '#f43f5e', color: '#f43f5e' },
  error: { dot: '#f43f5e', color: '#f43f5e' },
  paused: { dot: '#f59e0b', color: '#f59e0b' },
  installing: { dot: '#f59e0b', color: '#f59e0b' },
  'running(init)': { dot: '#f59e0b', color: '#f59e0b' },
  'running(apply)': { dot: '#f59e0b', color: '#f59e0b' },
  'running(modify)': { dot: '#f59e0b', color: '#f59e0b' },
  modified: { dot: '#f59e0b', color: '#f59e0b' },
  unknown: { dot: '#555', color: '#555' },
};

export const statusLabels: Record<string, string> = {
  running: 'Running',
  stopped: 'Stopped',
  error: 'Error',
  paused: 'Paused',
  installing: 'Installing',
};
