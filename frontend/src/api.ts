import type { VM, VMRequest, SettingsResponse, KratosFlow, ISOInfo } from './types';

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

export function createVM(req: { servername: string; os: string; cpu: number; memory: number; hdd: number; username: string; runcmd?: string; iso_volume?: string }): Promise<{ job_id: string }> {
  return api('/api/vm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export function updateVM(req: VMRequest): Promise<{ job_id: string; status: string }> {
  return api('/api/vm', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
}

export function deleteVM(vmid: number): Promise<{ status: string }> {
  return api('/api/vm', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vmid }),
  });
}

export function changeVMState(vmid: number, state: 'start' | 'stop'): Promise<{ status: string }> {
  return api('/api/vm/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vmid, state }),
  });
}

export function downloadKey(vmid: number): Promise<Blob> {
  return fetch(`/api/vm/key?vmid=${vmid}`, { credentials: 'include' }).then((res) => res.blob());
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

export function fetchJobs(): Promise<VM[]> {
  return api<VM[]>('/api/jobs');
}

export function fetchISOs(): Promise<ISOInfo[]> {
  return api<ISOInfo[]>('/api/isos');
}

export function uploadISO(file: File): Promise<ISOInfo> {
  const form = new FormData();
  form.append('iso', file);
  return api<ISOInfo>('/api/iso/upload', {
    method: 'POST',
    body: form,
  });
}

export function saveISOUrl(url: string, filename?: string): Promise<ISOInfo> {
  return api<ISOInfo>('/api/iso/save-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, filename }),
  });
}
