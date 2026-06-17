var osEl = $('info-os');
var hostnameEl = $('info-hostname');
var sshportEl = $('info-sshport');
var saveBtn = $('info-save');
var statusEl = $('info-status');

function setStatus(type, msg) {
  statusEl.style.display = msg ? '' : 'none';
  statusEl.style.color = type === 'success' ? '#22c55e' : '#f43f5e';
  statusEl.textContent = msg || '';
}

api('/api/settings').then(function(data) {
  [ 'AlmaLinux 9','AlmaLinux 8','CentOS 7','Debian 12','Debian 11',
    'Rocky Linux 9','Rocky Linux 8','Ubuntu 24.04','Ubuntu 22.04',
    'Ubuntu 20.04','Windows Server 2025','Windows Server 2022',
    'Windows Server 2019' ].forEach(function(os) {
    var opt = document.createElement('option');
    opt.value = os;
    opt.textContent = os;
    if (data.Os === os) opt.selected = true;
    osEl.appendChild(opt);
  });
  hostnameEl.value = data.Hostname || '';
  sshportEl.value = data.SSHPort || '';
}).catch(function() { setStatus('error', '設定の読み込みに失敗しました。'); });

saveBtn.addEventListener('click', function() {
  var payload = { Os: osEl.value, Hostname: hostnameEl.value, SSHPort: sshportEl.value };
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中\u2026';
  saveBtn.style.background = '#334155';
  saveBtn.style.cursor = 'default';
  setStatus(null, '');
  api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(function() { setStatus('success', '設定を保存しました。'); })
    .catch(function(err) { setStatus('error', err.message); })
    .finally(function() {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
      saveBtn.style.background = '#2563eb';
      saveBtn.style.cursor = 'pointer';
    });
});
