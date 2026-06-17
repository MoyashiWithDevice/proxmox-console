var hddEl = $('hdd-slider');
var cpuEl = $('cpu-slider');
var memEl = $('memory-slider');
var hddVal = $('hdd-value');
var cpuVal = $('cpu-value');
var memVal = $('memory-value');

function fmtHdd(v) { return v + ' GB'; }
function fmtCpu(v) { return v + ' Cores'; }
function fmtMem(v) { return v + ' GB'; }

function updateDisplay() {
  hddVal.textContent = fmtHdd(hddEl.value);
  cpuVal.textContent = fmtCpu(cpuEl.value);
  memVal.textContent = fmtMem(memEl.value);
}

api('/api/settings').then(function(data) {
  if (data.Hdd) { hddEl.value = data.Hdd; }
  if (data.Cpu) { cpuEl.value = data.Cpu; }
  if (data.Memory) { memEl.value = data.Memory; }
  updateDisplay();
}).catch(function() { updateDisplay(); });

hddEl.addEventListener('input', updateDisplay);
cpuEl.addEventListener('input', updateDisplay);
memEl.addEventListener('input', updateDisplay);
