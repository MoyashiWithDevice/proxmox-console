var vmid = (new URLSearchParams(location.search)).get('vmid') || '';
var term = new Terminal({
  cursorBlink: true,
  cursorStyle: 'block',
  fontSize: 14,
  fontFamily: 'Menlo,Monaco,monospace',
  theme: { background: '#000', foreground: '#e0e0e0', cursor: '#e0e0e0', selectionBackground: '#333', black: '#000', red: '#f43f5e', green: '#22c55e', yellow: '#eab308', blue: '#3b82f6', magenta: '#a855f7', cyan: '#06b6d4', white: '#e0e0e0' }
});
var fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal-container'));
fitAddon.fit();
var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
var wsUrl = proto + '//' + window.location.host + '/api/ws/terminal?vmid=' + encodeURIComponent(vmid);
var ws;
function connect() {
  ws = new WebSocket(wsUrl);
  ws.onopen = function() { term.focus(); };
  ws.onmessage = function(e) { term.write(e.data); };
  ws.onclose = function() { term.write('\r\n\x1b[31mConnection closed.\x1b[0m'); };
  ws.onerror = function() { term.write('\r\n\x1b[31mConnection error.\x1b[0m'); };
}
connect();
term.onData(function(data) { if (ws && ws.readyState === WebSocket.OPEN) { ws.send(data); } });
window.addEventListener('resize', function() { fitAddon.fit(); });
