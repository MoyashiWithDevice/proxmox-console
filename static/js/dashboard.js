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
  // 引数の action (PUT, PATCH, DELETE) をそのまま method に使用します
  api('/api/vm', { 
    method: action.toUpperCase(), // 念のため大文字に統一
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ vmid: vmid })
  })
    .then(function() { fetchVMs(); }) // 前述の流れに合わせて fetchItems() にしています。既存が fetchVMs() なら戻してください。
    .catch(function() {});
}

// ── Create VM Modal ──────────────────────────────────────────────
var createLimits = { cpu: { min: 1, max: 32, step: 1 }, memory: { min: 512, max: 8192, step: 512 }, hdd: { min: 1, max: 200, step: 1 } };

function openCreateModal() {
  var modal = $('create-modal');
  modal.style.display = 'flex';
  $('create-status').style.display = 'none';
  $('create-submit').disabled = false;
  $('create-submit').textContent = '作成';

  // Load settings for OS list and resource limits
  api('/api/settings').then(function(data) {
    // populate OS dropdown
    var osSel = $('create-os');
    osSel.innerHTML = '';
    if (data.os && Array.isArray(data.os)) {
      data.os.forEach(function(o) {
        var opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.label;
        osSel.appendChild(opt);
      });
    }
    // set resource limits from server config
    if (data.cpu) { createLimits.cpu = data.cpu; setSliderRange('create-cpu', data.cpu); }
    if (data.memory) { createLimits.memory = data.memory; setSliderRange('create-memory', data.memory); }
    if (data.hdd) { createLimits.hdd = data.hdd; setSliderRange('create-hdd', data.hdd); }
    // restore saved preferences
    if (data.Os) osSel.value = data.Os;
    if (data.Runcmd) $('create-runcmd').value = data.Runcmd;
  }).catch(function() {});

  updateSliderDisplay('create-cpu', 'create-cpu-value', 'Cores');
  updateSliderDisplay('create-memory', 'create-memory-value', 'GB', 1024);
  updateSliderDisplay('create-hdd', 'create-hdd-value', 'GB');
}

function closeCreateModal() {
  $('create-modal').style.display = 'none';
}

function setSliderRange(id, limits) {
  var el = $(id);
  if (limits.min != null) el.min = limits.min;
  if (limits.max != null) el.max = limits.max;
  if (limits.step != null) el.step = limits.step;
  el.value = Math.max(el.min, Math.min(el.max, el.value));
}

function updateSliderDisplay(sliderId, valueId, unit, divisor) {
  var slider = $(sliderId);
  var display = $(valueId);
  function upd() {
    var v = parseInt(slider.value, 10);
    if (divisor) { display.textContent = (v / divisor) + ' ' + unit; }
    else { display.textContent = v + ' ' + unit; }
  }
  upd();
  slider.addEventListener('input', upd);
}

function submitCreateVM() {
  try {
    var servername = $('create-servername').value.trim();
    if (!servername) { showCreateStatus('error', 'サーバー名を入力してください。'); return; }

    var btn = $('create-submit');
    btn.disabled = true;
    btn.textContent = '作成中…';
    btn.style.background = '#334155';
    showCreateStatus(null, '');

    var payload = {
      servername: servername,
      os: $('create-os').value,
      cpu: parseInt($('create-cpu').value, 10),
      memory: parseInt($('create-memory').value, 10),
      hdd: parseInt($('create-hdd').value, 10),
      username: $('create-username').value.trim() || 'user',
      runcmd: $('create-runcmd').value
    };

    var xhr = new XMLHttpRequest();
    xhr.open('PUT', '/api/vm', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = 60000;

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        closeCreateModal();
        fetchVMs();
      } else {
        var msg = '作成に失敗しました (HTTP ' + xhr.status + ')';
        try { var errResp = JSON.parse(xhr.responseText); if (errResp.error) msg = errResp.error; } catch(e) {}
        showCreateStatus('error', msg);
        btn.disabled = false;
        btn.textContent = '作成';
        btn.style.background = '#2563eb';
      }
    };

    xhr.onerror = function() {
      showCreateStatus('error', 'ネットワークエラーが発生しました。');
      btn.disabled = false;
      btn.textContent = '作成';
      btn.style.background = '#2563eb';
    };

    xhr.ontimeout = function() {
      showCreateStatus('error', 'リクエストがタイムアウトしました。');
      btn.disabled = false;
      btn.textContent = '作成';
      btn.style.background = '#2563eb';
    };

    xhr.send(JSON.stringify(payload));
  } catch(e) {
    showCreateStatus('error', 'エラー: ' + e.message);
    var btn = $('create-submit');
    btn.disabled = false;
    btn.textContent = '作成';
    btn.style.background = '#2563eb';
  }
}

function showCreateStatus(type, msg) {
  var el = $('create-status');
  if (!msg) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.background = type === 'error' ? 'rgba(244,63,79,0.1)' : 'rgba(34,197,94,0.1)';
  el.style.color = type === 'error' ? '#f43f5e' : '#22c55e';
  el.style.border = '1px solid ' + (type === 'error' ? 'rgba(244,63,79,0.2)' : 'rgba(34,197,94,0.2)');
  el.textContent = msg;
}

fetchVMs();
setInterval(fetchVMs, 7000);
