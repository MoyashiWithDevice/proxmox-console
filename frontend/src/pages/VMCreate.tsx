import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSettings, createVM, fetchISOs, uploadISO, saveISOUrl } from '../api';
import { Icon } from '../components/Icon';
import { StepIndicator } from '../components/StepIndicator';
import type { SettingsResponse, ISOInfo } from '../types';

const steps = ['Server Info', 'Resources', 'Review'];

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#000',
  border: '1px solid #111',
  color: '#fff',
  fontSize: 14,
  padding: '10px 12px',
  borderRadius: 4,
  outline: 'none',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: 80,
  fontFamily: 'inherit',
};

const ghostBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #111',
  borderRadius: 4,
  color: '#444',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  padding: '10px 20px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const smallBtn: React.CSSProperties = {
  ...ghostBtn,
  padding: '6px 12px',
  fontSize: 11,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

export function VMCreate() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);

  const [os, setOs] = useState('');
  const [hostname, setHostname] = useState('');
  const [username, setUsername] = useState('');
  const [runcmd, setRuncmd] = useState('');
  const [hdd, setHdd] = useState(50);
  const [cpu, setCpu] = useState(4);
  const [mem, setMem] = useState(8);
  const [isos, setIsos] = useState<ISOInfo[]>([]);
  const [isoVolume, setIsoVolume] = useState('');

  const [downloadUrl, setDownloadUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const useISO = isoVolume !== '';

  useEffect(() => {
    fetchSettings().then((data) => {
      setSettings(data);
      setOs(data.os?.[0]?.id || '');
      if (data.hdd) setHdd(data.hdd.min || 20);
      if (data.cpu) setCpu(data.cpu.min || 4);
      if (data.memory) setMem(data.memory.min || 8);
    }).catch(() => {});
    fetchISOs().then((data) => setIsos(data || [])).catch(() => {});
  }, []);

  function getISOValue(iso: ISOInfo): string {
    return iso.volume_id || `url:${iso.id}`;
  }

  function getSelectedISO(): ISOInfo | undefined {
    return isos.find((i) => getISOValue(i) === isoVolume);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const iso = await uploadISO(file);
      setIsos((prev) => [iso, ...prev]);
      setIsoVolume(iso.volume_id);
    } catch (err) {
      alert('Upload failed: ' + (err instanceof Error ? err.message : err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDownload() {
    if (!downloadUrl.trim()) return;
    setDownloading(true);
    try {
      const iso = await saveISOUrl(downloadUrl.trim());
      setIsos((prev) => [iso, ...prev]);
      setIsoVolume(iso.volume_id || `url:${iso.id}`);
      setDownloadUrl('');
    } catch (err) {
      alert('Failed to save URL: ' + (err instanceof Error ? err.message : err));
    } finally {
      setDownloading(false);
    }
  }

  async function handleCreate() {
    if (!hostname || !username) {
      alert('Please fill in hostname and username');
      return;
    }
    if (!useISO && !os) {
      alert('Please select an OS template');
      return;
    }

    let isoVolumeToSend = '';
    if (useISO) {
      const selected = getSelectedISO();
      if (!selected) {
        alert('Please select a valid ISO');
        return;
      }
      isoVolumeToSend = selected.volume_id || '';
    }

    setCreating(true);
    try {
      const { job_id } = await createVM({
        servername: hostname,
        os: useISO ? '' : os,
        cpu,
        memory: mem,
        hdd,
        username,
        runcmd: runcmd || undefined,
        iso_volume: isoVolumeToSend || undefined,
      });
      navigate(`/vm?job_id=${job_id}`);
    } catch {
      setCreating(false);
    }
  }

  if (!settings) {
    return <div style={{ color: '#555', fontSize: 13 }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <StepIndicator steps={steps} current={step} />

      {step === 0 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: '#fff', marginBottom: 24 }}>Server Configuration</h2>

          {!useISO && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 500 }}>OS</div>
              <select value={os} onChange={(e) => setOs(e.target.value)} style={inputStyle}>
                {(settings.os || []).map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          )}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 500 }}>Hostname</div>
            <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="e.g. web-server-01" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 500 }}>Username</div>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="VM login user" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 500 }}>Initialization Command</div>
            <textarea
              value={runcmd}
              onChange={(e) => setRuncmd(e.target.value)}
              style={textareaStyle}
              placeholder="# e.g. apt update && apt install -y nginx"
            />
          </div>

          <div style={{ marginBottom: 28, padding: 16, border: '1px solid #111', borderRadius: 4 }}>
            <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 500 }}>ISO Image</div>

            <div style={{ marginBottom: 12 }}>
              <select
                value={isoVolume}
                onChange={(e) => setIsoVolume(e.target.value)}
                style={inputStyle}
              >
                <option value="">None (use template)</option>
                {isos.map((iso) => (
                  <option key={iso.id} value={getISOValue(iso)}>
                    {iso.filename}{iso.source_url ? ' (URL)' : ''} ({formatBytes(iso.size)})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#444', marginBottom: 6 }}>Upload ISO file</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".iso"
                  onChange={handleUpload}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ ...smallBtn, color: uploading ? '#555' : '#fff' }}
                >
                  <Icon name="hardDrive" size={10} /> {uploading ? 'Uploading...' : 'Choose ISO file'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: '#444', marginBottom: 6 }}>Download from URL</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={downloadUrl}
                  onChange={(e) => setDownloadUrl(e.target.value)}
                  placeholder="https://example.com/ubuntu-22.04.iso"
                  style={{ ...inputStyle, flex: 1 }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleDownload(); }}
                />
                <button
                  onClick={handleDownload}
                  disabled={downloading || !downloadUrl.trim()}
                  style={{ ...smallBtn, color: downloading || !downloadUrl.trim() ? '#555' : '#fff', whiteSpace: 'nowrap' }}
                >
                  <Icon name="hardDrive" size={10} /> {downloading ? 'Downloading...' : 'Download'}
                </button>
              </div>
            </div>
          </div>

          <button onClick={() => setStep(1)} style={ghostBtn}>
            Next <Icon name="arrowRight" size={12} />
          </button>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: '#fff', marginBottom: 24 }}>Resource Allocation</h2>

          <SliderRow
            icon="hardDrive" label="HDD" value={hdd} setValue={setHdd}
            min={settings.hdd?.min || 20} max={settings.hdd?.max || 200}
            step={settings.hdd?.step || 5} unit="GB"
          />
          <SliderRow
            icon="cpu" label="CPU" value={cpu} setValue={setCpu}
            min={settings.cpu?.min || 1} max={settings.cpu?.max || 32}
            step={settings.cpu?.step || 1} unit="Cores"
          />
          <SliderRow
            icon="memoryStick" label="Memory" value={mem} setValue={setMem}
            min={settings.memory?.min || 1} max={settings.memory?.max || 64}
            step={settings.memory?.step || 1} unit="MB"
          />

          <div style={{ display: 'flex', gap: 8, marginTop: 32 }}>
            <button onClick={() => setStep(0)} style={ghostBtn}>
              <Icon name="arrowLeft" size={12} /> Back
            </button>
            <button onClick={() => setStep(2)} style={ghostBtn}>
              Next <Icon name="arrowRight" size={12} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500, color: '#fff', marginBottom: 24 }}>Review & Create</h2>
          <div style={{ border: '1px solid #111', padding: 24, marginBottom: 24 }}>
            {useISO ? (
              <ReviewRow label="Mode" value="ISO Install" />
            ) : (
              <ReviewRow label="OS" value={(settings.os || []).find((o) => o.id === os)?.label || os} />
            )}
            {useISO && <ReviewRow label="ISO" value={getSelectedISO()?.filename || isoVolume} />}
            <ReviewRow label="Hostname" value={hostname} />
            <ReviewRow label="Username" value={username} />
            {runcmd && <ReviewRow label="Init Command" value={runcmd} />}
            <ReviewRow label="CPU" value={`${cpu} Cores`} />
            <ReviewRow label="Memory" value={`${mem} MB`} />
            <ReviewRow label="Storage" value={`${hdd} GB`} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep(1)} style={ghostBtn}>
              <Icon name="arrowLeft" size={12} /> Back
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{ ...ghostBtn, color: creating ? '#555' : '#fff' }}
            >
              {creating ? 'Creating...' : <><Icon name="plus" size={12} /> Create VM</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #111' }}>
      <span style={{ fontSize: 12, color: '#555' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#ccc' }}>{value}</span>
    </div>
  );
}

function SliderRow({ icon, label, value, setValue, min, max, step, unit }: {
  icon: 'hardDrive' | 'cpu' | 'memoryStick';
  label: string;
  value: number;
  setValue: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  const barCol = pct > 85 ? '#f43f5e' : pct > 65 ? '#f59e0b' : '#fff';
  const trackRef = useRef<HTMLDivElement>(null);

  function fromEvent(clientX: number) {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const steps = Math.round((min + x * (max - min)) / step);
    setValue(Math.min(max, Math.max(min, steps * step)));
  }

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    fromEvent(e.clientX);
    const onMove = (ev: MouseEvent) => fromEvent(ev.clientX);
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={icon} size={14} color="#444" />
          <span style={{ fontSize: 13, color: '#ccc' }}>{label}</span>
        </div>
        <span style={{ fontSize: 13, color: '#888' }}>{value} {unit}</span>
      </div>
      <div
        onMouseDown={onMouseDown}
        style={{ height: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', userSelect: 'none' }}
      >
        <div ref={trackRef} style={{ flex: 1, height: 3, background: '#1e1e1e', borderRadius: 1, position: 'relative' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: barCol, borderRadius: 1 }} />
          <div style={{
            position: 'absolute', left: `${pct}%`, top: '50%',
            width: 12, height: 12, borderRadius: '50%', background: barCol,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 0 2px #000',
          }} />
        </div>
      </div>
    </div>
  );
}
