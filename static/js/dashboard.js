var vms = [];
var badgeColors = { running: '#22c55e', stopped: '#6b7280', error: '#f43f5e', installing: '#eab308', default: '#555' };
var badgeText = { running: 'Running', stopped: 'Stopped', error: 'Error', installing: 'Installing' };

function n(v, s) { return v != null ? v : (s || 0); }

function updateStats(data) {
  var totalVMs = 0, totalCores = 0, totalMem = 0, totalDisk = 0;
  data.filter(function(i) { return i.Type === 'vm'; }).forEach(function(vm) {
    totalVMs++;
    totalCores += n(vm.Cores);
    totalMem += n(vm.Memory);
    totalDisk += n(vm.Hdd);
  });
  document.getElementById('stat-vms').textContent = totalVMs;
  document.getElementById('stat-cores').textContent = totalCores;
  document.getElementById('stat-memory').textContent = totalMem + ' GB';
  document.getElementById('stat-disk').textContent = totalDisk + ' GB';
}

function statusBadge(s) {
  var c = badgeColors[s] || badgeColors.default;
  var t = badgeText[s] || s;
  return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;font-size:11px;font-weight:500;border-radius:4px;background:' + c + '20;color:' + c + '">' +
    '<span style="width:6px;height:6px;border-radius:50%;background:' + c + '"></span>' + t + '</span>';
}

function actionButton(label, color, onclick) {
  return '<button style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:' + color + ';padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px" onclick="' + onclick.replace(/"/g,'&quot;') + '">' + label + '</button>';
}

function renderTable(data) {
  var tbody = document.getElementById('vm-tbody');
  var items = data.filter(function(i) { return i.Type === 'vm'; });
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="padding:48px 16px;text-align:center;color:#555;font-size:14px">No virtual machines found.</td></tr>';
    return;
  }
  var html = '';
  items.forEach(function(vm) {
    var vmid = n(vm.VMID, '');
    var name = n(vm.Name, 'Unnamed');
    var status = n(vm.Status, 'stopped');
    var ip = n(vm.IP, '-');
    var cores = n(vm.Cores);
    var mem = n(vm.Memory);
    var hdd = n(vm.Hdd);
    var badge = statusBadge(status);
    var startBtn = status !== 'running' ? actionButton('Start', '#22c55e', 'vmAction(\'' + vmid + '\',\'start\')') : '';
    var stopBtn = status === 'running' ? actionButton('Stop', '#f43f5e', 'vmAction(\'' + vmid + '\',\'stop\')') : '';
    html += '<tr style="border-bottom:1px solid #1a1a1a;cursor:pointer" ondblclick="window.location.href=\'/vm?vmid=' + vmid + '\'">' +
      '<td style="padding:12px 16px;font-size:13px;color:#888"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/></svg></td>' +
      '<td style="padding:12px 16px;font-size:13px;color:#ddd"><a href="/vm?vmid=' + vmid + '" style="color:#888;text-decoration:none;font-family:monospace">' + vmid + '</a></td>' +
      '<td style="padding:12px 16px;font-size:13px;color:#ddd;font-weight:500"><a href="/vm?vmid=' + vmid + '" style="color:#fff;text-decoration:none;font-family:inherit">' + name + '</a></td>' +
      '<td style="padding:12px 16px;font-size:13px">' + badge + '</td>' +
      '<td style="padding:12px 16px;font-size:13px;color:#777;font-family:monospace">' + ip + '</td>' +
      '<td style="padding:12px 16px;font-size:13px;color:#aaa">' + cores + '</td>' +
      '<td style="padding:12px 16px;font-size:13px;color:#aaa">' + mem + ' GB</td>' +
      '<td style="padding:12px 16px;font-size:13px;color:#aaa">' + hdd + ' GB</td>' +
      '<td style="padding:12px 16px;font-size:13px"><div style="display:flex;gap:4px">' + startBtn + stopBtn + '</div></td>' +
      '</tr>';
  });
  tbody.innerHTML = html;
}

function fetchVMs() {
  api('/api/vms').then(function(data) {
    if (!Array.isArray(data)) return;
    vms = data;
    updateStats(data);
    renderTable(data);
  }).catch(function() {});
}

function vmAction(vmid, action) {
  api('/api/vm?' + new URLSearchParams({ vmid: vmid, action: action }), { method: 'POST' })
    .then(function() { fetchVMs(); })
    .catch(function() {});
}

fetchVMs();
setInterval(fetchVMs, 7000);
