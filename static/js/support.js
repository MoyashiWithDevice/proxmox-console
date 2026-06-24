var defaultVmid = (new URLSearchParams(location.search)).get('vmid') || '';
var subjectEl = $('support-subject');
var vmidEl = $('support-vmid');
var detailsEl = $('support-details');
var submitBtn = $('support-submit');
var statusEl = $('support-status');

if (defaultVmid) { vmidEl.value = defaultVmid; }

function setStatus(type, msg) {
  statusEl.style.display = msg ? 'block' : 'none';
  statusEl.style.color = type === 'success' ? '#22c55e' : '#f43f5e';
  statusEl.textContent = msg || '';
}

api('/api/vms').then(function(data) {
  if (!Array.isArray(data)) return;
  data.filter(function(item) { return item.type === 'vm'; }).forEach(function(vm) {
    var opt = document.createElement('option');
    opt.value = vm.VMID;
    opt.textContent = vm.VMID + ' \u2014 ' + (vm.Name || 'Unnamed');
    if (vm.VMID === defaultVmid) opt.selected = true;
    vmidEl.appendChild(opt);
  });
}).catch(function() {});

submitBtn.addEventListener('click', function() {
  var subject = subjectEl.value.trim();
  var details = detailsEl.value.trim();
  if (!subject || !details) {
    setStatus('error', '件名と詳細は必須です。');
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = '送信\u2026';
  submitBtn.style.background = '#334155';
  submitBtn.style.cursor = 'default';
  setStatus(null, '');
  api('/api/support', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject: subject, vmid: vmidEl.value, details: details })
  }).then(function(data) {
    setStatus('success', data.message || 'サポート依頼を送信しました。');
    subjectEl.value = '';
    vmidEl.value = '';
    detailsEl.value = '';
  }).catch(function(err) {
    setStatus('error', err.message || '送信に失敗しました。');
  }).finally(function() {
    submitBtn.disabled = false;
    submitBtn.textContent = '送信';
    submitBtn.style.background = '#2563eb';
    submitBtn.style.cursor = 'pointer';
  });
});
