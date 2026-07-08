var _vm = null, _items = [], _hovered = null;
var _s = "\u2014", _log = "", _jvmid = null, _ri = 10;
var _name = "", _cores = 0, _mem = 0, _hdd = 0;
var _editing = false, _saving = false, _jobId = null, _jobStatus = "\u2014", _deleting = false;

var params = new URLSearchParams(location.search);
var id = params.get("vmid");
var jobId = params.get("job_id");
var isJob = Boolean(jobId);

function badgeHTML(st) {
  var c = STATUS_COLORS[st] || STATUS_COLORS.unknown;
  var r = parseInt(c.slice(1,3),16), g = parseInt(c.slice(3,5),16), b = parseInt(c.slice(5,7),16);
  return '<span style="display:inline-flex;align-items:center;gap:6;font-size:13;font-weight:500;color:' + c + ';padding:4px 10px;border-radius:6;background:rgba(' + r + ',' + g + ',' + b + ',0.1)"><span style="width:6px;height:6px;border-radius:50%;background:' + c + '"></span>' + st + '</span>';
}

function render() {
  renderSidebar();
  renderMain();
}

function renderSidebar() {
  var cont = $("sidebar-items");
  if (_items.length === 0) {
    cont.innerHTML = '<div style="padding:6px 16px;font-size:12px;color:#333">\u306a\u3057</div>';
    return;
  }
  var html = "";
  var vms = _items.filter(function(v) { return v.type !== "job"; });
  vms.forEach(function(v) {
    var isActive = String(v.VMID) === String(id);
    var isHover = _hovered === "vm-" + v.VMID;
    var vmStatus = v.status || v.Status || "unknown";
    var ss = STATUS_COLORS[vmStatus] || STATUS_COLORS.unknown;
    var color = isActive ? "#fff" : isHover ? "#aaa" : "#555";
    var bg = isActive ? "#111" : "transparent";
    var borderL = isActive ? "2px solid #fff" : "2px solid transparent";
    html += '<div onmouseenter="setHover(\'vm-' + v.VMID + '\')" onmouseleave="setHover(null)" onclick="window.location.href=\'/vm?vmid=' + v.VMID + '\'" style="display:flex;align-items:center;gap:8;padding:6px 16px;cursor:pointer;font-size:13;color:' + color + ';background:' + bg + ';border-left:' + borderL + ';user-select:none;transition:all 0.15s;margin-bottom:2;border-radius:0 6px 6px 0">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:' + ss + ';flex-shrink:0;margin-top:2"></span>' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 5H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4M8 21h8m-4-4v4"/></svg>' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHTML((v.Name || "")) + '</span></div>';
  });
  var hasJobs = _items.some(function(v) { return v.type === "job"; });
  if (hasJobs) {
    html += '<div style="padding:8px 18px 4px;font-size:10px;color:#2a2a2a;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;margin-top:14">\u4f5c\u6210\u4e2d</div>';
    _items.filter(function(v) { return v.type === "job"; }).forEach(function(v) {
      var isActiveJob = String(v.id) === String(id);
      var isHoverJob = _hovered === "job-" + v.id;
      var js = STATUS_COLORS[v.status] || STATUS_COLORS.unknown;
      var jcolor = isActiveJob ? "#fff" : isHoverJob ? "#aaa" : "#888";
      html += '<div onmouseenter="setHover(\'job-' + v.id + '\')" onmouseleave="setHover(null)" onclick="window.location.href=\'/vm?job_id=' + v.id + '\'" style="display:flex;align-items:center;gap:8;padding:6px 16px;cursor:pointer;font-size:13;color:' + jcolor + ';background:' + (isActiveJob?"#111":"transparent") + ';border-left:' + (isActiveJob?"2px solid #fff":"2px solid transparent") + ';user-select:none;transition:all 0.15s;margin-bottom:2;border-radius:0 6px 6px 0">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + js + ';flex-shrink:0;margin-top:2"></span>' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + js + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 5H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4M8 21h8m-4-4v4"/></svg>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHTML(v.servername || "") + ' (' + (v.status || '\u4f5c\u6210\u4e2d') + ')</span></div>';
    });
  }
  cont.innerHTML = html;
}

function renderMain() {
  var title = $("page-title");
  var desc = $("page-desc");
  var area = $("content-area");
  var slink = $("support-link");
  if (isJob) {
    title.textContent = "VM Creation";
    desc.textContent = "Track your VM creation progress";
    area.innerHTML = renderJobProgress();
  } else if (!id) {
    area.innerHTML = '<div style="color:#666;font-size:13">Select a VM from the list to view details</div>';
  } else if (_vm === null) {
    area.innerHTML = '<div style="font-size:13;color:#333">Loading...</div>';
  } else {
    area.innerHTML = renderVMEditor();
  }
  slink.style.display = (id || _jvmid) ? "block" : "none";
  if (id || _jvmid) {
    var target = encodeURIComponent(id || _jvmid);
    $("support-link-a").href = "/support?vmid=" + target;
    $("support-link-a").textContent = "Need help? Contact support \u2192";
  }
  var btnS = $("btn-support");
  if (btnS) {
    var target = id || _jvmid;
    btnS.onclick = function() { window.location.href = "/support" + (target ? "?vmid=" + encodeURIComponent(target) : ""); };
  }
}

function renderJobProgress() {
  var html = '<div style="background:#111;border:1px solid #1a1a1a;border-radius:4;padding:24">';
  html += '<div style="display:flex;align-items:center;gap:10;margin-bottom:20"><span style="font-size:10;color:#666;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Status</span> ' + badgeHTML(_s) + '</div>';
  html += '<div id="job-log" style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:4;padding:16;height:300;white-space:pre-wrap;font-family:Monaco,monospace;font-size:11;color:#888;overflow:auto;line-height:1.5">' + colorizeTerraformLog(_log) + '</div>';
  if (_jvmid && _s === "done") {
    html += '<div style="margin-top:20"><div style="color:#aaa;font-size:12;margin-bottom:8">VM created successfully. Redirecting in ' + _ri + ' seconds...</div>';
    html += '<div style="width:100%;height:2;background:#1a1a1a;border-radius:1;overflow:hidden"><div style="height:100%;background:#22c55e;width:' + (100 - (_ri/10*100)) + '%;transition:width 0.3s"></div></div></div>';
  }
  if (_s === "error") {
    html += '<div style="margin-top:20;display:flex;gap:8">';
    html += '<button onclick="retryJob()" style="padding:10px 20px;background:#2563eb;border:none;border-radius:6;color:#fff;cursor:pointer;font-size:13;font-weight:500;transition:all 0.2s">Retry</button>';
    html += '<button onclick="window.location.href=\'/\'" style="padding:10px 20px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6;color:#aaa;cursor:pointer;font-size:13;font-weight:500">Back to Dashboard</button>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

/* ===== Terraform log colorizer ===== */
function colorizeTerraformLog(text) {
  if (typeof text !== 'string') return String(text);
  var s = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  var lines = s.split('\n');
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var L = lines[i];
    var c = null;

    if (/^Error:/.test(L)) c = '#ef4444';
    else if (/^\s*[+\-~] /.test(L) && !/^Error:/.test(L)) {
      c = L.trim().charAt(0) === '+' ? '#22c55e' : L.trim().charAt(0) === '-' ? '#ef4444' : '#f59e0b';
    }
    else if (/^Plan: /.test(L)) {
      L = L.replace(/(\d+) to add/g, '<span style="color:#22c55e">$1 to add</span>')
           .replace(/(\d+) to (change|modify)/g, '<span style="color:#f59e0b">$1 to $2</span>')
           .replace(/(\d+) to destroy/g, '<span style="color:#ef4444">$1 to destroy</span>');
      out.push(L);
      continue;
    }
    else if (/^- (Finding|Installing|Downloading)/.test(L)) c = '#60a5fa';
    else if (/^(Initializing|Terraform has been successfully initialized)/.test(L)) c = '#22c55e';
    else if (/Terraform (will perform|used the selected)/.test(L)) c = '#ccc';
    else if (/Creation complete after/.test(L)) c = '#22c55e';
    else if (/(Still creating|Still destroying)\.\.\./.test(L)) c = '#666';
    else if (/Creating\.\.\./.test(L)) c = '#f59e0b';
    else if (/^  # .+ (will be |must be)/.test(L)) c = '#bbb';
    else if (/^\s+(with|on)\s/.test(L)) c = '#b91c1c';
    else if (/^\s+\d+: /.test(L)) c = '#b91c1c';

    if (c) {
      out.push('<span style="color:' + c + '">' + L + '</span>');
    } else {
      out.push(L);
    }
  }
  return out.join('\n');
}
/* ===== end colorizer ===== */

function renderVMEditor() {
  var vm = _vm;
  var html = "";
  html += '<div style="max-width:800px">';
  html += '<div style="display:flex;gap:10;margin-bottom:28;align-items:center">';
  html += '<button onclick="window.open(\'/terminal?vmid=' + vm.VMID + '\',\'_blank\',\'noopener,noreferrer\')" style="padding:8px 16px;border-radius:4;border:1px solid #2563eb;background:rgba(37,99,235,0.1);color:#60a5fa;cursor:pointer;font-size:12;font-weight:500;transition:all 0.2s;display:inline-flex;align-items:center;gap:6">' + iconTerminalSmall() + ' Terminal</button>';
  if (!_editing) {
    var isRunning = (vm.Status || vm.status) === "running";
    html += '<button onclick="toggleVM(\'' + vm.VMID + '\',\'' + (isRunning?"stop":"start") + '\')" style="padding:8px 16px;border-radius:4;border:1px solid #1a1a1a;background:#111;color:#fff;cursor:pointer;font-size:12;font-weight:500;transition:all 0.2s">' + (isRunning ? "Stop" : "Start") + '</button>';
  }
  html += '</div>';
  html += '<div style="background:#111;border:1px solid #1a1a1a;border-radius:4;padding:24;margin-bottom:24">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28;padding-bottom:20;border-bottom:1px solid #1a1a1a">';
  html += '<div style="flex:1"><div style="display:flex;gap:32;margin-bottom:0"><div><div style="font-size:10;color:#555;margin-bottom:6;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">VMID</div><div style="font-size:15;font-weight:500;color:#fff;font-family:Monaco,monospace">' + escapeHTML(vm.VMID) + '</div></div><div><div style="font-size:10;color:#555;margin-bottom:6;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">IP Address</div><div style="font-size:15;font-weight:500;color:#fff;font-family:Monaco,monospace">' + (vm.IP || "\u2014") + '</div></div></div></div>';
  if (_editing) {
    html += '<div><button onclick="cancelEdit()" style="margin-right:8;padding:8px 14px;background:transparent;border:1px solid #1a1a1a;border-radius:4;color:#aaa;cursor:pointer;font-size:12;font-weight:500;transition:all 0.2s">Cancel</button><button onclick="saveVM()" style="padding:8px 14px;background:#fff;color:#000;border:none;border-radius:4;cursor:' + (_saving?"default":"pointer") + ';font-size:12;font-weight:600;opacity:' + (_saving?0.7:1) + ';transition:all 0.2s"' + (_saving?' disabled':'') + '>' + (_saving?"Saving...":"Save") + '</button></div>';
  } else {
    html += '<div><button onclick="startEdit()" style="padding:8px 14px;background:#fff;color:#000;border:none;border-radius:4;cursor:pointer;font-size:12;font-weight:600;transition:all 0.2s">Edit</button></div>';
  }
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24">';
  html += editField("Name", _editing ? '<input id="f-name" value="' + escapeHTML(_name) + '" oninput="setF(\'name\',this.value)" style="width:100%;background:#0a0a0a;border:1px solid #1a1a1a;color:#fff;font-size:14;padding:10px 12px;border-radius:4;outline:none;transition:all 0.2s">' : viewVal(_name || "\u2014"));
  html += editField("CPU Cores", _editing ? '<input type="number" id="f-cores" value="' + _cores + '" oninput="setF(\'cores\',this.value)" style="width:100%;background:#0a0a0a;border:1px solid #1a1a1a;color:#fff;font-size:14;padding:10px 12px;border-radius:4;outline:none;transition:all 0.2s">' : viewVal(_cores));
  html += editField("Memory (MB)", _editing ? '<input type="number" id="f-memory" value="' + _mem + '" oninput="setF(\'memory\',this.value)" style="width:100%;background:#0a0a0a;border:1px solid #1a1a1a;color:#fff;font-size:14;padding:10px 12px;border-radius:4;outline:none;transition:all 0.2s">' : viewVal(_mem));
  html += editField("Storage (GB)", _editing ? '<input type="number" id="f-hdd" value="' + _hdd + '" oninput="setF(\'hdd\',this.value)" style="width:100%;background:#0a0a0a;border:1px solid #1a1a1a;color:#fff;font-size:14;padding:10px 12px;border-radius:4;outline:none;transition:all 0.2s">' : viewVal(_hdd));
  html += '</div>';
  if (!_editing) {
    html += '<div style="margin-top:24;padding-top:20;border-top:1px solid #1a1a1a"><button onclick="downloadKey()" style="padding:8px 12px;background:transparent;border:1px solid #1a1a1a;border-radius:4;color:#666;cursor:pointer;font-size:12;font-weight:500;transition:all 0.2s;display:inline-flex;align-items:center;gap:6">' + iconDownloadSmall() + ' Download Private Key</button></div>';
  }
  html += '</div>';
  if (!_editing) {
    html += '<div style="background:rgba(244,63,94,0.05);border:1px solid #f43f5e;border-radius:4;padding:24">' +
      '<h3 style="font-size:13;font-weight:600;color:#f43f5e;margin-bottom:8">Danger Zone</h3>' +
      '<p style="font-size:12;color:#888;margin-bottom:16">This action cannot be undone. The virtual machine will be permanently deleted.</p>' +
      '<button onclick="deleteVM()" style="padding:10px 16px;background:#dc2626;border:none;border-radius:4;color:#fff;cursor:' + (_deleting?"default":"pointer") + ';font-size:12;font-weight:600;opacity:' + (_deleting?0.7:1) + ';transition:all 0.2s;display:inline-flex;align-items:center;gap:6"' + (_deleting?' disabled':'') + '>' + iconTrashSmall() + ' ' + (_deleting?"Deleting...":"Delete VM") + '</button></div>';
  }
  html += '</div>';
  return html;
}

function editField(label, content) {
  return '<div style="margin-bottom:20"><div style="font-size:10;color:#555;margin-bottom:6;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">' + label + '</div>' + content + '</div>';
}
function viewVal(v) { return '<div style="color:#bbb;font-size:14;padding:10px 12px;background:#0a0a0a;border-radius:4;border:1px solid #1a1a1a;font-weight:400">' + v + '</div>'; }

function iconTerminalSmall() {
  return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>';
}
function iconDownloadSmall() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 3v13"/></svg>';
}
function iconTrashSmall() {
  return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6h16zM10 11v6M14 11v6"/></svg>';
}

function setHover(h) { _hovered = h; renderSidebar(); }
function setF(f, v) { if(f==='name')_name=v; else if(f==='cores')_cores=v; else if(f==='memory')_mem=v; else if(f==='hdd')_hdd=v; }

function startEdit() { _editing=true; renderMain(); }
function cancelEdit() { resetFields(); _editing=false; renderMain(); }
function resetFields() { if(_vm){_name=_vm.Name||'';_cores=_vm.Cores||0;_mem=_vm.Memory||0;_hdd=_vm.Hdd||0;} }

function toggleVM(vmid, action) {
  if (action === "stop" && !confirm("Stop this VM?")) return;
  api('/api/vm/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vmid: vmid, state: action }) })
    .then(function(data) {
      if (_vm) { _vm.status = action === "start" ? "running" : "stopped"; _vm.Status = _vm.status; }
      renderMain();
    }).catch(function(err) { alert("Failed: " + err.message); });
}

function downloadKey() {
  if (!_vm || !_vm.VMID) { alert("VM ID not found"); return; }
  fetch('/api/vm/key?vmid=' + _vm.VMID, { credentials: 'include' })
    .then(function(res) { return res.blob(); })
    .then(function(blob) {
      var url = window.URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = "vm-" + _vm.VMID + "-id_rsa";
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    }).catch(function(err) { alert("Failed to download key: " + err.message); });
}

function saveVM() {
  var newHdd = parseInt(_hdd, 10);
  if (newHdd < _vm.Hdd) { alert("Cannot decrease disk size"); return; }

  // 変更されたフィールドのみ収集
  var patch = { vmid: _vm.VMID };
  if (_name !== (_vm.Name || ''))          patch.name   = _name;
  if (parseInt(_cores, 10) !== _vm.Cores)  patch.cores  = parseInt(_cores, 10);
  if (parseInt(_mem,   10) !== _vm.Memory) patch.memory = parseInt(_mem, 10);
  if (newHdd !== _vm.Hdd)                  patch.hdd    = newHdd;

  // vmid 以外に変更がなければ何もしない
  if (Object.keys(patch).length <= 0) { 
    _editing = false; 
    renderMain(); 
    return; 
  }

  _saving = true;
  renderMain();
  api('/api/vm', { 
    method: 'PATCH', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify(patch) 
  })
    .then(function(data) {
      if (data.job_id) { _jobId = data.job_id; _jobStatus = "running"; pollJobStatus(); }
      else { _saving = false; _editing = false; renderMain(); }
    })
    .catch(function() { _saving = false; alert("Failed to send request"); renderMain(); });
}

function deleteVM() {
  if (!confirm("Are you sure? This action cannot be undone.")) return;
  _deleting = true; renderMain();
  
  fetch('/api/vm', { 
    method: 'DELETE', 
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ vmid: _vm.VMID })
  })
    .then(function(response) {
      if (response.ok) { window.location.href = "/"; return; }
      return response.text().then(function(body) { _deleting = false; alert("Deletion failed: " + body); renderMain(); });
    }).catch(function(err) { _deleting = false; alert("Deletion failed: " + err.message); renderMain(); });
}

function retryJob() {
  if (!jobId) return;
  var btn = document.querySelector('#content-area button');
  if (btn) { btn.disabled = true; btn.textContent = 'Retrying...'; }

  api('/api/vm/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId })
  }).then(function(data) {
    if (data.job_id) {
      window.location.href = '/vm?job_id=' + data.job_id;
    }
  }).catch(function(err) {
    alert('Retry failed: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  });
}

function init() {
  function fetchItems() {
    api('/api/vms')
      .then(function(data) { 
        _items = data || []; 
        renderSidebar(); 
        
        // 一覧を更新した後に、現在の状態も連動して更新する
        updateStateFromItems();
      })
      .catch(function() {});
  }

  function updateStateFromItems() {
    var logEl = document.getElementById("job-log");
    var wasAtBottom = logEl ? (logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 1) : true;

    if (id) {
      var matchedVmById = _items.find(function(item) {
        return item.VMID == id;
      });
      if (matchedVmById) {
        _vm = matchedVmById;
        resetFields();
      } else {
        _vm = null;
      }
    }

    // Job IDがない場合の初期化処理
    if (!jobId) { 
      _s = "\u2014"; 
      _log = ""; 
      _jvmid = null; 
      render(); 
      return; 
    }

    var matchedJob = _items.find(function(item) {
      return item.id === jobId; 
    });

    if (matchedJob) {
      _s = matchedJob.status || "\u2014";
      _log = matchedJob.log || "";
      
      if (matchedJob.VMID) {
        _jvmid = matchedJob.VMID;
        if (!id) {
          _vm = matchedJob; 
          resetFields();
        }
      }
    } else {
      if (!id) { _vm = null; }
    }

    renderMain();
    autoScrollLog(wasAtBottom);
  }

  fetchItems();
  setInterval(function() { fetchItems(); }, 10000);

  if (jobId) {
    setInterval(function() {
      if (!jobId || _s !== "done" || !_jvmid) return;
      _ri -= 1;
      if (_ri <= 0) { window.location.href = "/vm?vmid=" + _jvmid; }
      else { renderMain(); }
    }, 1000);
  }

  function autoScrollLog(flag) {
    if (!flag) return;
    var el = document.getElementById("job-log");
    if (el) el.scrollTop = el.scrollHeight;
  }
}

/* ===== Terraform log colorizer ===== */
function colorizeTerraformLog(text) {
  if (typeof text !== 'string') return String(text);
  var s = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  var lines = s.split('\n');
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var L = lines[i];
    var c = null;
    if (/^Error:/.test(L)) c = '#ef4444';
    else if (/^\s*[+\-~] /.test(L)) {
      c = L.trim().charAt(0) === '+' ? '#22c55e' : L.trim().charAt(0) === '-' ? '#ef4444' : '#f59e0b';
    }
    else if (/^Plan: /.test(L)) {
      L = L.replace(/(\d+) to add/g, '<span style="color:#22c55e">$1 to add</span>')
           .replace(/(\d+) to (change|modify)/g, '<span style="color:#f59e0b">$1 to $2</span>')
           .replace(/(\d+) to destroy/g, '<span style="color:#ef4444">$1 to destroy</span>');
      out.push(L);
      continue;
    }
    else if (/^- (Finding|Installing|Downloading)/.test(L)) c = '#60a5fa';
    else if (/^(Initializing|Terraform has been successfully initialized)/.test(L)) c = '#22c55e';
    else if (/Terraform (will perform|used the selected)/.test(L)) c = '#ccc';
    else if (/Creation complete after/.test(L)) c = '#22c55e';
    else if (/(Still creating|Still destroying)\.\.\./.test(L)) c = '#666';
    else if (/Creating\.\.\./.test(L)) c = '#f59e0b';
    else if (/^  # .+ (will be |must be)/.test(L)) c = '#bbb';
    else if (/^\s+(with|on)\s/.test(L)) c = '#b91c1c';
    else if (/^\s+\d+: /.test(L)) c = '#b91c1c';
    if (c) {
      out.push('<span style="color:' + c + '">' + L + '</span>');
    } else {
      out.push(L);
    }
  }
  return out.join('\n');
}
/* ===== end colorizer ===== */


init();