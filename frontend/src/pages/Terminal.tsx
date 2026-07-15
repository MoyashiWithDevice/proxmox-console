import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function TerminalPage() {
  const [searchParams] = useSearchParams();
  const vmid = searchParams.get('vmid') || '';
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Menlo,Monaco,monospace',
      theme: {
        background: '#000',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        selectionBackground: '#333',
        black: '#000',
        red: '#f43f5e',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e0e0e0',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current = fitAddon;

    function connect() {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/api/vm/terminal?vmid=${encodeURIComponent(vmid)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => { term.focus(); };
      ws.onmessage = (e) => { term.write(e.data); };
      ws.onclose = () => { term.write('\r\n\x1b[31mConnection closed.\x1b[0m'); };
      ws.onerror = () => { term.write('\r\n\x1b[31mConnection error.\x1b[0m'); };
    }

    connect();

    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    const handleResize = () => { fitAddon.fit(); };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [vmid]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#000', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 44, background: '#000', borderBottom: '1px solid #111', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#aaa' }}>Terminal</span>
          <span style={{ fontSize: 11, color: '#444' }}>VM {vmid}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { window.location.href = `/vm?id=${vmid}`; }}
            style={{ background: 'none', border: '1px solid #111', color: '#444', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
          >
            Back
          </button>
          <button
            onClick={() => { window.location.href = '/logout'; }}
            style={{ background: 'none', border: 'none', color: '#444', padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}
          >
            Logout
          </button>
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, padding: 8, background: '#000' }} />
    </div>
  );
}
