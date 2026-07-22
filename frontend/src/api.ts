import type { VM, VMRequest, SettingsResponse, KratosFlow } from './types';

export function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const options: RequestInit = {
    credentials: 'include',
    ...opts,
  };
  return fetch(path, options).then((r) => {
    if (!r.ok) return r.text().then((t) => { throw new Error(t || 'Request failed'); });
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('json')) return r.json();
    return r.text();
  }) as Promise<T>;
}

export function fetchVMs(): Promise<VM[]> {
  return api<VM[]>('/api/vms');
}

export function fetchVM(id: number): Promise<VM> {
  return api<VM>(`/api/vms/${id}`);
}

export function fetchJob(id: string): Promise<VM> {
  return api<VM>(`/api/jobs/${id}`);
}

export function createVM(req: { servername: string; os: string; cpu: number; memory: number; hdd: number; username: string; runcmd?: string; iso_volume?: string }): Promise<{ job_id: string }> {
  return api('/api/vms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export function updateVM(vmid: number, req: Omit<VMRequest, 'vmid'>): Promise<{ job_id: string; status: string }> {
  return api(`/api/vms/${vmid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export function deleteVM(vmid: number): Promise<{ status: string }> {
  return api(`/api/vms/${vmid}`, {
    method: 'DELETE',
  });
}

export function changeVMState(vmid: number, state: 'start' | 'stop'): Promise<{ status: string }> {
  return api(`/api/vms/${vmid}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
}

export function downloadKey(vmid: number): Promise<Blob> {
  return fetch(`/api/vms/${vmid}/key`, { credentials: 'include' }).then((res) => res.blob());
}

export function fetchSettings(): Promise<SettingsResponse> {
  return api<SettingsResponse>('/api/settings');
}

export function submitSupport(data: { subject: string; vmid: string; details: string }): Promise<{ message: string }> {
  return api('/api/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function fetchKratosFlow({ path, flowId }: { path: string; flowId: string }): Promise<KratosFlow> {
  return api<KratosFlow>(`${path}?id=${flowId}`, {
    headers: { 'Accept': 'application/json' },
  });
}

export function fetchKratosError(id: string): Promise<KratosFlow> {
  return api<KratosFlow>(`${id}`, {
    headers: { 'Accept': 'application/json' },
  });
}

export function submitAuthFlow(
  path: string,
  formData: URLSearchParams
): Promise<{ redirect_to?: string } | KratosFlow> {
  return fetch(path, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    credentials: 'include',
    body: formData.toString(),
  }).then((r) => r.json());
}

export function fetchJobs(): Promise<VM[]> {
  return api<VM[]>('/api/jobs');
}

export interface AdminUser {
  id: number;
  kratos_id: string;
  role: string;
  created_at: string;
  email: string;
}

export function fetchAdminUsers(): Promise<AdminUser[]> {
  return api<AdminUser[]>('/api/admin/users');
}

export interface AdminSettings {
  resources: {
    cpu: { min: number; max: number };
    memory: { min: number; max: number; step: number };
    hdd: { min: number; max: number; step: number };
  };
  os: Array<{ id: string; label: string; template_id: number; image?: string }>;
  agent: { user: string };
}

export function fetchAdminSettings(): Promise<AdminSettings> {
  return api<AdminSettings>('/api/admin/settings');
}

export function updateAdminSettings(data: Partial<AdminSettings>): Promise<{ status: string }> {
  return api('/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export interface SupportRequest {
  id: number;
  user_id: number | null;
  kratos_id: string;
  subject: string;
  vmid: string | null;
  details: string;
  status: string;
  created_at: string;
  email: string;
}

export function fetchAdminSupport(): Promise<SupportRequest[]> {
  return api<SupportRequest[]>('/api/admin/support');
}

export function updateSupportStatus(id: number, status: string): Promise<{ status: string }> {
  return api<{ status: string }>(`/api/admin/support/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}


