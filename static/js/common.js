// Proxmox Console - Common Utilities
function escapeHTML(s) {
  if (typeof s !== 'string') return String(s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function $(id) { return document.getElementById(id); }

function api(path, opts) {
  opts = opts || {};
  opts.credentials = 'include';
  return fetch(path, opts).then(function(r) {
    if (!r.ok) return r.text().then(function(t) { throw new Error(t || 'Request failed'); });
    var ct = r.headers.get('content-type') || '';
    if (ct.indexOf('json') >= 0) return r.json();
    return r.text();
  });
}

var STATUS_COLORS = {
  running: '#22c55e', done: '#22c55e',
  stopped: '#f43f5e', error: '#f43f5e',
  installing: '#eab308',
  'running(init)': '#f59e0b', 'running(apply)': '#f59e0b',
  'running(modify)': '#f59e0b', modified: '#f59e0b',
  unknown: '#555'
};

var STATUS_LABELS = {
  running: 'Running', stopped: 'Stopped', error: 'Error', installing: 'Installing'
};

function statusBadgeHTML(st) {
  var c = STATUS_COLORS[st] || STATUS_COLORS.unknown;
  var l = STATUS_LABELS[st] || st;
  var r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
  return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:' + c + ';padding:4px 10px;border-radius:6px;background:rgba('+r+','+g+','+b+',0.1)">' +
    '<span style="width:6px;height:6px;border-radius:50%;background:' + c + '"></span>' + l + '</span>';
}

function statusDotHTML(st) {
  var c = STATUS_COLORS[st] || STATUS_COLORS.unknown;
  return '<span style="width:8px;height:8px;border-radius:50%;background:' + c + ';flex-shrink:0"></span>';
}
