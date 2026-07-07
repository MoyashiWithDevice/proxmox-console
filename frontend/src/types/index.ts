export interface VMResponse {
  type: 'vm' | 'job';
  VMID?: number;
  CPU?: number;
  Memory?: number;
  HDD?: number;
  Servername?: string;
  Name?: string;
  OS?: string;
  Status?: string;
  IP?: string;
  JOBID?: string;
  status?: string;
  servername?: string;
  job_id?: string;
  vmid?: number;
  Cores?: number;
  Hdd?: number;
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
  sshport?: string;
}

export interface SettingsResponse {
  cpu: { min: number; max: number; step: number };
  memory: { min: number; max: number; step: number };
  hdd: { min: number; max: number; step: number };
  os: { id: string; label: string }[];
}

export interface OSOption {
  id: string;
  label: string;
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
