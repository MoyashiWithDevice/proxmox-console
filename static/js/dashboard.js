var vms = [];

function Bar(value, max) {
  var pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  var col = pct > 85 ? '#f43f5e' : pct > 65 ? '#f59e0b' : '#fff';
  return '<div style="display:flex;align-items:center;gap:10px">' +
    '<div style="flex:1;height:3px;background:#1e1e1e;border-radius:2px">' +
    '<div style="width:' + pct + '%;height:100%;background:' + col + ';border-radius:2px"></div></div>' +
    '<span style="font-size:11px;color:#555;min-width:28px;text-align:right">' + pct + '%</span></div>';
}

function StatCard(iconName, iconPath, label, used, total, unit) {
  var pct = total === 0 ? 0 : Math.round((used / total) * 100);
  return '<div style="flex:1;min-width:140px;padding:20px 24px;border:1px solid #111">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">' + iconPath + '</svg>' +
    '<span style="font-size:11px;color:#444;text-transform:uppercase;letter-spacing:0.08em">' + label + '</span></div>' +
    '<div style="font-size:28px;font-weight:300;color:#fff;margin-bottom:12px;line-height:1">' + pct + '<span style="font-size:14px;color:#444">%</span></div>' +
    Bar(used, total) +
    '<div style="margin-top:8px;font-size:11px;color:#333">' + used + ' / ' + total + ' ' + unit + '</div></div>';
}

function statusBadge(status) {
  var cfg = STATUS_COLORS[status] || STATUS_COLORS.unknown;
  return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:' + cfg + '">' +
    '<span style="width:7px;height:7px;border-radius:50%;background:' + cfg + ';flex-shrink:0"></span>' + status + '</span>';
}

function resourcesFromItems(data) {
  var arr = (data || []).filter(function(i) { return i.type === "vm"; });
  var cpuUsed = arr.reduce(function(s, vm) { return s + (Number(vm.Cores) || 0); }, 0);
  var memUsed = arr.reduce(function(s, vm) { return s + ((Number(vm.Memory) || 0) / 1024); }, 0);
  var diskUsed = arr.reduce(function(s, vm) { return s + (Number(vm.Hdd) || 0); }, 0);
  return {
    cpu: { used: cpuUsed, cores: Math.max(cpuUsed, 1) },
    memory: { used: Math.round(memUsed * 10) / 10, total: Math.max(Math.round(memUsed * 10) / 10, 1) },
    disk: { used: diskUsed, total: Math.max(diskUsed, 1) }
  };
}

function jobStatusColor(status) {
  return status === "error" ? '#f43f5e' : '#f59e0b';
}

function renderSidebar(data) {
  var cont = $('sidebar-items');
  if (!cont) return;
  var items = data || [];
  var completedVMs = items.filter(function(i) { return i.type === "vm"; });
  var activeJobs = items.filter(function(i) { return i.type === "job"; });
  if (completedVMs.length === 0 && activeJobs.length === 0) {
    cont.innerHTML = '<div style="padding:6px 16px;font-size:12px;color:#333">なし</div>';
    return;
  }
  var html = '';
  completedVMs.forEach(function(vm) {
    var vmStatus = vm.status || vm.Status || "unknown";
    var c = STATUS_COLORS[vmStatus] || STATUS_COLORS.unknown;
    html += '<div onclick="window.location.href=\'/vm?vmid=' + vm.VMID + '\'" style="display:flex;align-items:center;gap:8px;padding:6px 16px;cursor:pointer;font-size:13px;color:#555;user-select:none">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:' + c + ';flex-shrink:0;margin-top:2px"></span>' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 5H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4M8 21h8m-4-4v4"/></svg>' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHTML(vm.Name || "") + '</span></div>';
  });
  if (activeJobs.length > 0) {
    html += '<div style="padding:8px 18px 4px;font-size:10px;color:#2a2a2a;text-transform:uppercase;letter-spacing:0.1em;margin-top:14px">作成中</div>';
    activeJobs.forEach(function(job) {
      var jc = jobStatusColor(job.status);
      html += '<div onclick="window.location.href=\'/vm?job_id=' + job.id + '\'" style="display:flex;align-items:center;gap:8px;padding:6px 16px;cursor:pointer;font-size:13px;color:#888;user-select:none">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + jc + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 5H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4M8 21h8m-4-4v4"/></svg>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHTML(job.servername || "") + ' (作成中)</span></div>';
    });
  }
  cont.innerHTML = html;
}

function renderStatCards(res) {
  var cont = $('stat-cards');
  if (!cont) return;
  var icons = {
    cpu: 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M9 9h6v6H9z M9 1v2M15 1v2M9 21v2M15 21v2M1 9h2M1 15h2M21 9h2M21 15h2',
    memory: 'M6 19v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1m0 0v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1m0 0v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M3 10h18M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    disk: 'M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01'
  };
  cont.innerHTML =
    StatCard('cpu', icons.cpu, 'CPU', res.cpu.used, res.cpu.cores, 'cores') +
    StatCard('memory', icons.memory, 'Memory', res.memory.used, res.memory.total, 'GiB') +
    StatCard('disk', icons.disk, 'Disk', res.disk.used, res.disk.total, 'GiB');
}

function renderMeta(data) {
  var cont = $('dash-meta');
  if (!cont) return;
  var items = data || [];
  var running = items.filter(function(i) { return i.type === "vm"; }).length;
  var errored = items.filter(function(i) { return i.type === "job" && i.status === "error"; }).length;
  var pending = items.filter(function(i) { return i.type === "job"; }).length;
  cont.innerHTML =
    '<div><div style="font-size:11px;color:#333;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.07em">VM稼働数</div><div style="font-size:13px;color:#888">' + running + ' 台</div></div>' +
    '<div><div style="font-size:11px;color:#333;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.07em">エラー</div><div style="font-size:13px;color:#888">' + errored + ' 件</div></div>' +
    '<div><div style="font-size:11px;color:#333;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.07em">処理中</div><div style="font-size:13px;color:#888">' + pending + ' 件</div></div>' +
    '<div><div style="font-size:11px;color:#333;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.07em">合計</div><div style="font-size:13px;color:#888">' + items.length + ' 件</div></div>';
}

function updateBadge(data) {
  var badge = $('dash-badge');
  if (!badge) return;
  var running = (data || []).filter(function(i) { return i.type === "vm"; }).length;
  if (running > 0) {
    badge.innerHTML = statusBadge('running');
  } else {
    badge.innerHTML = statusBadge('stopped');
  }
}

function renderTable(data) {
  var tbody = document.getElementById('vm-tbody');
  if (!tbody) return;
  var items = (data || []).filter(function(i) { return i.type === "vm"; });
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:48px 0;text-align:center;border:1px solid #111"><div style="font-size:13px;color:#333">作成済みのマシンはありません</div></td></tr>';
    return;
  }
  var html = '';
  items.forEach(function(vm) {
    var vmStatus = vm.status || vm.Status || "unknown";
    var st = STATUS_COLORS[vmStatus] || STATUS_COLORS.unknown;
    var td = 'padding:14px 16px;font-size:13px;color:#ccc;border-bottom:1px solid #0d0d0d;white-space:nowrap';
    html += '<tr onclick="window.location.href=\'/vm?vmid=' + vm.VMID + '\'" style="cursor:pointer">' +
      '<td style="' + td + ';color:#2a2a2a">' + (vm.VMID || '—') + '</td>' +
      '<td style="' + td + ';color:#fff"><div style="display:flex;align-items:center;gap:8px">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + st + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 5H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4M8 21h8m-4-4v4"/></svg>' +
      escapeHTML(vm.Name || "") + '</div></td>' +
      '<td style="' + td + ';font-family:monospace;font-size:12px">' + (vm.IP || '—') + '</td>' +
      '<td style="' + td + '">' + (vm.Cores || '—') + '</td>' +
      '<td style="' + td + '">' + (vm.Memory || '—') + ' MB</td>' +
      '<td style="' + td + ';width:140px">' +
      '<button onclick="event.stopPropagation();vmAction(\'' + vm.VMID + '\',\'' + (vmStatus === 'running' ? 'stop' : 'start') + '\')" style="padding:6px 10px;border-radius:6px;border:none;background:' + (vmStatus === 'running' ? '#dc2626' : '#16a34a') + ';color:#fff;cursor:pointer;font-size:12px">' +
      (vmStatus === 'running' ? 'Stop' : 'Start') + '</button></td></tr>';
  });
  tbody.innerHTML = html;
}

function renderJobRows(data) {
  var tbody = document.getElementById('vm-tbody');
  if (!tbody) return;
  var jobs = (data || []).filter(function(i) { return i.type === "job"; });
  if (jobs.length === 0) return;
  var html = tbody.innerHTML;
  jobs.forEach(function(job) {
    var jc = jobStatusColor(job.status);
    var td = 'padding:14px 16px;font-size:13px;border-bottom:1px solid #0d0d0d;white-space:nowrap';
    html += '<tr onclick="window.location.href=\'/vm?job_id=' + job.id + '\'" style="cursor:pointer;background:#050505">' +
      '<td style="' + td + ';color:#2a2a2a">—</td>' +
      '<td style="' + td + ';color:#fff"><div style="display:flex;align-items:center;gap:8px">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + jc + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 5H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4M8 21h8m-4-4v4"/></svg>' +
      escapeHTML(job.servername || "") + ' (作成中)</div></td>' +
      '<td style="' + td + ';font-family:monospace;font-size:12px">' + (job.ip || '—') + '</td>' +
      '<td style="' + td + '">—</td>' +
      '<td style="' + td + '">—</td>' +
      '<td style="' + td + '"></td></tr>';
  });
  tbody.innerHTML = html;
}

function updateAll(data) {
  vms = data;
  renderSidebar(data);
  renderStatCards(resourcesFromItems(data));
  renderMeta(data);
  updateBadge(data);
  renderTable(data);
  renderJobRows(data);
}

function fetchVMs() {
  api('/api/vms').then(function(data) {
    if (!Array.isArray(data)) return;
    updateAll(data);
  }).catch(function() {});
}

function vmAction(vmid, action) {
  if (action === 'stop' && !confirm('このVMを停止しますか？')) return;
  api('/api/vm/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vmid: vmid, state: action })
  }).then(function() { fetchVMs(); }).catch(function(err) { alert('操作に失敗しました: ' + err.message); });
}

fetchVMs();
setInterval(fetchVMs, 7000);
