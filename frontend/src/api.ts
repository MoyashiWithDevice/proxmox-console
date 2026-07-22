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

export function fetchVM(uuid: string): Promise<VM> {
  return api<VM>(`/api/vms/${uuid}`);
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

export function updateVM(uuid: string, req: Omit<VMRequest, 'vmid'>): Promise<{ job_id: string; status: string }> {
  return api(`/api/vms/${uuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export function deleteVM(uuid: string): Promise<{ status: string }> {
  return api(`/api/vms/${uuid}`, {
    method: 'DELETE',
  });
}

export function changeVMState(uuid: string, state: 'start' | 'stop'): Promise<{ status: string }> {
  return api(`/api/vms/${uuid}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
}

export function downloadKey(uuid: string): Promise<Blob> {
  return fetch(`/api/vms/${uuid}/key`, { credentials: 'include' }).then((res) => res.blob());
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


