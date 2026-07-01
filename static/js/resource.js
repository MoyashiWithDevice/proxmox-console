var hddEl = $('hdd-slider');
var cpuEl = $('cpu-slider');
var memEl = $('memory-slider');
var hddVal = $('hdd-value');
var cpuVal = $('cpu-value');
var memVal = $('memory-value');
var osEl = $('info-os');
var hostnameEl = $('info-hostname');
var usernameEl = $('info-username');
var submitBtn = $('resource-submit');
var statusEl = $('resource-status');

function fmtHdd(v) { return v + ' GB'; }
function fmtCpu(v) { return v + ' Cores'; }
function fmtMem(v) { return v + ' MB'; }

function setStatus(type, msg) {
  statusEl.style.display = msg ? '' : 'none';
  statusEl.style.color = type === 'success' ? '#22c55e' : '#f43f5e';
  statusEl.textContent = msg || '';
}

function applyConstraints(slider, limits) {
  slider.min = limits.min;
  slider.max = limits.max;
  if (limits.step) slider.step = limits.step;
  slider.value = limits.min;
}

function updateDisplay() {
  hddVal.textContent = fmtHdd(hddEl.value);
  cpuVal.textContent = fmtCpu(cpuEl.value);
  memVal.textContent = fmtMem(memEl.value);
}

api('/api/settings').then(function(data) {
  if (data.hdd) applyConstraints(hddEl, data.hdd);
  if (data.cpu) applyConstraints(cpuEl, data.cpu);
  if (data.memory) applyConstraints(memEl, data.memory);
  (data.os || []).forEach(function(os) {
    var opt = document.createElement('option');
    opt.value = os.id;
    opt.textContent = os.label;
    osEl.appendChild(opt);
  });
  updateDisplay();
}).catch(function() { updateDisplay(); });

hddEl.addEventListener('input', updateDisplay);
cpuEl.addEventListener('input', updateDisplay);
memEl.addEventListener('input', updateDisplay);

submitBtn.addEventListener('click', function() {
  var payload = {
    cpu: parseInt(cpuEl.value, 10),
    memory: parseInt(memEl.value, 10),
    hdd: parseInt(hddEl.value, 10),
    os: osEl.value,
    servername: hostnameEl.value,
    username: usernameEl.value
  };
  submitBtn.disabled = true;
  submitBtn.textContent = '作成中\u2026';
  submitBtn.style.background = '#334155';
  submitBtn.style.cursor = 'default';
  setStatus(null, '');
  api('/api/vm', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(payload)
  }).then(function(data) {
    var jobId = data && data.job_id;
    if (jobId) {
      window.location.href = '/vm?job_id=' + encodeURIComponent(jobId);
    } else {
      window.location.href = '/';
    }
  }).catch(function(err) {
    setStatus('error', err.message);
  }).finally(function() {
    submitBtn.disabled = false;
    submitBtn.textContent = '作成';
    submitBtn.style.background = '#2563eb';
    submitBtn.style.cursor = 'pointer';
  });
});