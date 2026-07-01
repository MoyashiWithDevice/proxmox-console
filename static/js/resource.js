var _cpu = 1, _mem = 1024, _hdd = 10;

function sliderRow(id, label, icon, val, min, max, step, unit) {
  return '<div style="padding:28px 32px;border:1px solid #111">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">' +
    '<div style="display:flex;align-items:center;gap:10px">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="' + icon + '"/></svg>' +
    '<span style="font-size:12px;color:#444;text-transform:uppercase;letter-spacing:0.08em">' + label + '</span></div>' +
    '<span style="font-size:22px;font-weight:300;color:#fff" id="' + id + '-val">' + val + '<span style="font-size:13px;color:#444;margin-left:4px">' + unit + '</span></span></div>' +
    '<div style="display:flex;align-items:center;gap:16px">' +
    '<input type="range" min="' + min + '" max="' + max + '" step="' + (step||1) + '" value="' + val + '" oninput="update' + id + '(this.value)" style="flex:1" id="' + id + '-range">' +
    '<input type="number" min="' + min + '" max="' + max + '" step="' + (step||1) + '" value="' + val + '" oninput="update' + id + '(this.value)" style="width:80px;text-align:center;font-size:13px;background:#0a0a0a;color:#ccc;border:1px solid #111;border-radius:4px;padding:8px 10px;outline:none" id="' + id + '-num">' +
    '</div></div>';
}

var cpuIcon = 'M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z M9 9h6v6H9z M9 1v2M15 1v2M9 21v2M15 21v2M1 9h2M1 15h2M21 9h2M21 15h2';
var memIcon = 'M6 19v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1m0 0v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1m0 0v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M3 10h18M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z';
var hddIcon = 'M22 12H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11zM6 16h.01M10 16h.01';

function updateCpu(v) {
  _cpu = Number(v);
  $('cpu-val').innerHTML = _cpu + '<span style="font-size:13px;color:#444;margin-left:4px">コア</span>';
  $('cpu-range').value = _cpu; $('cpu-num').value = _cpu;
  $('res-cpu-hidden').value = _cpu; updateSummary();
}
function updateMem(v) {
  _mem = Number(v);
  $('mem-val').innerHTML = _mem + '<span style="font-size:13px;color:#444;margin-left:4px">MB</span>';
  $('mem-range').value = _mem; $('mem-num').value = _mem;
  $('res-mem-hidden').value = _mem; updateSummary();
}
function updateHdd(v) {
  _hdd = Number(v);
  $('hdd-val').innerHTML = _hdd + '<span style="font-size:13px;color:#444;margin-left:4px">GB</span>';
  $('hdd-range').value = _hdd; $('hdd-num').value = _hdd;
  $('res-hdd-hidden').value = _hdd; updateSummary();
}
function updateSummary() {
  $('res-cpu-label').textContent = _cpu + ' コア';
  $('res-mem-label').textContent = _mem + ' MB';
  $('res-hdd-label').textContent = _hdd + ' GB';
}

function render() {
  $('resource-area').innerHTML =
    sliderRow('cpu', 'CPU コア数', cpuIcon, _cpu, 1, 3, 1, 'コア') +
    sliderRow('mem', 'メモリ', memIcon, _mem, 512, 4096, 512, 'MB') +
    sliderRow('hdd', 'ディスク容量', hddIcon, _hdd, 1, 64, 1, 'GB');
  updateSummary();
}

render();
