/* Pro v2 script: multi-chart, filters, aggregation */

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const message = document.getElementById('message');
const progress = document.getElementById('progress');
const progressBar = document.getElementById('progress-bar');
const overview = document.getElementById('overview');
const panel = document.getElementById('panel');
const tableContainer = document.getElementById('table-container');
const summaryStats = document.getElementById('summary-stats');
const chartCanvas1 = document.getElementById('chartCanvas1');
const chartCanvas2 = document.getElementById('chartCanvas2');
const colSelect = document.getElementById('col-select');
const colSelect2 = document.getElementById('col-select-2');
const chartTypeSelect = document.getElementById('chart-type');
const aggType = document.getElementById('agg-type');
const previewCount = document.getElementById('preview-count');
const downloadJsonBtn = document.getElementById('download-json');
const downloadCsvBtn = document.getElementById('download-csv');
const statRows = document.getElementById('stat-rows');
const statCols = document.getElementById('stat-cols');
const statMissing = document.getElementById('stat-missing');
const statNumeric = document.getElementById('stat-numeric');
const dzText = document.getElementById('dz-text');
const applyBtn = document.getElementById('apply-btn');
const resetBtn = document.getElementById('reset-btn');
const rowFilterInput = document.getElementById('row-filter');
const themeToggle = document.getElementById('theme-toggle');

let rawRows = [];
let filteredRows = [];
let chart1 = null, chart2 = null;

themeToggle.addEventListener('change', e => {
  document.body.classList.toggle('dark', e.target.checked);
  document.body.classList.toggle('light', !e.target.checked);
});

function setProgress(p){
  progress.hidden = false;
  progressBar.style.width = Math.min(100, Math.max(0, p)) + '%';
  if(p >= 100){ setTimeout(()=> progress.hidden = true, 400); }
}

function showMessage(txt){ message.textContent = txt; dzText.textContent = txt; }
function resetUI(){ overview.hidden=true; panel.hidden=true; downloadJsonBtn.disabled=true; downloadCsvBtn.disabled=true; }

resetUI();

function parseCSV(file){
  return new Promise((resolve, reject) => {
    let loaded = 0;
    Papa.parse(file, {
      header:true, dynamicTyping:true, skipEmptyLines:true,
      chunk: function(results, parser){
        loaded += results.data.length;
        setProgress(Math.min(95, loaded/1000*100));
      },
      complete: function(results){
        setProgress(100);
        resolve(results.data);
      },
      error: function(err){ reject(err); }
    });
  });
}

function parseExcel(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = function(e){
      try{
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type:'array'});
        const first = workbook.SheetNames[0];
        const json = XLSX.utils.sheet_to_json(workbook.Sheets[first], {defval:null});
        setProgress(100);
        resolve(json);
      } catch(err){ reject(err); }
    };
    reader.onprogress = function(e){ if(e.lengthComputable){ setProgress(Math.floor((e.loaded/e.total)*90)); } };
    reader.readAsArrayBuffer(file);
  });
}

async function handleFile(file){
  showMessage('Loading ' + file.name + ' ...');
  setProgress(10);
  const name = file.name.toLowerCase();
  try{
    let rows = [];
    if(name.endsWith('.csv')) rows = await parseCSV(file);
    else if(name.endsWith('.xlsx') || name.endsWith('.xls')) rows = await parseExcel(file);
    else throw new Error('Unsupported file type');
    rawRows = rows;
    filteredRows = rows.slice();
    onDataLoaded(rows);
  }catch(err){
    showMessage('Error: ' + err.message);
    console.error(err);
    setProgress(0);
  }
}

['dragenter','dragover'].forEach(evt => {
  dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('dragover'); });
});
['dragleave','drop'].forEach(evt => {
  dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('dragover'); });
});
dropZone.addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if(f) handleFile(f); });
fileInput.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if(f) handleFile(f); });

applyBtn.addEventListener('click', ()=> { applyFiltersAndRender(); });
resetBtn.addEventListener('click', ()=> { filteredRows = rawRows.slice(); rowFilterInput.value=''; populateColumnSelect(rawRows); renderTable(rawRows); renderSummary(rawRows); renderCharts(rawRows); });

function onDataLoaded(rows){
  if(!rows || !rows.length){ showMessage('No data found'); return; }
  showMessage('Loaded: ' + rows.length + ' rows');
  setProgress(100);
  overview.hidden = false;
  panel.hidden = false;
  renderOverview(rows);
  populateColumnSelect(rows);
  renderTable(rows);
  renderSummary(rows);
  setupDownloadButtons(rows);
  renderCharts(rows);
}

function renderOverview(rows){
  const cols = Object.keys(rows[0]);
  const n = rows.length;
  let totalMissing = 0;
  let numericCount = 0;
  cols.forEach(col=>{
    rows.forEach(r=>{ const v = r[col]; if(v === null || v === undefined || v === '') totalMissing++; });
    if(rows.some(r=> typeof r[col] === 'number' && !isNaN(r[col]))) numericCount++;
  });
  statRows.textContent = n;
  statCols.textContent = cols.length;
  statMissing.textContent = totalMissing;
  statNumeric.textContent = numericCount;
}

function populateColumnSelect(rows){
  colSelect.innerHTML = '';
  colSelect2.innerHTML = '<option value="">— none —</option>';
  const cols = Object.keys(rows[0]);
  cols.forEach(c=>{
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c; colSelect.appendChild(opt);
    const opt2 = document.createElement('option'); opt2.value = c; opt2.textContent = c; colSelect2.appendChild(opt2);
  });
  colSelect.addEventListener('change', ()=> renderCharts(filteredRows));
  colSelect2.addEventListener('change', ()=> renderCharts(filteredRows));
  chartTypeSelect.addEventListener('change', ()=> renderCharts(filteredRows));
  aggType.addEventListener('change', ()=> renderCharts(filteredRows));
  previewCount.addEventListener('change', ()=> renderTable(filteredRows));
}

function renderTable(rows){
  const cols = Object.keys(rows[0]);
  const max = Math.min(rows.length, Number(previewCount.value) || 100);
  let html = '<table><thead><tr>';
  cols.forEach(c=> html += '<th>' + escapeHtml(c) + '</th>');
  html += '</tr></thead><tbody>';
  for(let i=0;i<max;i++){
    html += '<tr>';
    cols.forEach(c=> html += '<td>' + escapeHtml(String(rows[i][c]===null? '': rows[i][c])) + '</td>');
    html += '</tr>';
  }
  html += '</tbody></table>';
  tableContainer.innerHTML = html;
}

function renderSummary(rows){
  const cols = Object.keys(rows[0]);
  let html = '<div class="summary-list">';
  cols.forEach(col=>{
    let missing=0, numericCount=0, sum=0, min=Infinity, max=-Infinity;
    rows.forEach(r=>{
      const v = r[col];
      if(v===null || v===undefined || v==='') missing++;
      if(typeof v === 'number' && !isNaN(v)){ numericCount++; sum+=v; if(v<min)min=v; if(v>max)max=v; }
    });
    html += '<div class="summary-item"><strong>' + escapeHtml(col) + '</strong>: missing ' + missing;
    if(numericCount>0) html += ' • n=' + numericCount + ' • mean=' + (sum/numericCount).toFixed(3) + ' • min=' + min + ' • max=' + max;
    html += '</div>';
  });
  html += '</div>';
  summaryStats.innerHTML = html;
}

function applyFiltersAndRender(){
  if(!rawRows || !rawRows.length) return;
  const filterText = rowFilterInput.value.trim();
  filteredRows = rawRows.slice();
  if(filterText){
    const [col, ...rest] = filterText.split('=');
    if(col && rest.length>0){
      const val = rest.join('=').trim();
      const key = col.trim();
      filteredRows = filteredRows.filter(r => String(r[key]) === val);
    }
  }
  renderOverview(filteredRows);
  renderTable(filteredRows);
  renderSummary(filteredRows);
  renderCharts(filteredRows);
  setupDownloadButtons(filteredRows);
}

function renderCharts(rows){
  if(!rows || !rows.length) return;
  const col = colSelect.value || Object.keys(rows[0])[0];
  const col2 = colSelect2.value || null;
  const type = chartTypeSelect.value || 'bar';
  const agg = aggType.value || 'count';

  // prepare data for primary chart
  const values = rows.map(r=> r[col]).filter(v=> v !== null && v !== undefined && v !== '');
  const numeric = values.filter(v=> typeof v === 'number' && !isNaN(v));

  let labels1 = [], data1 = [];
  if(numeric.length>0 && (type==='bar' || type==='line')){
    const min = Math.min(...numeric), max = Math.max(...numeric);
    const bins = 12; const step = (max-min)/bins || 1; const counts = Array(bins).fill(0);
    numeric.forEach(v=>{ let idx = Math.floor((v-min)/step); if(idx<0)idx=0; if(idx>=bins)idx=bins-1; counts[idx]++; });
    labels1 = counts.map((_,i)=> (min + i*step).toFixed(2)+'-'+(min + (i+1)*step).toFixed(2));
    data1 = counts;
  } else {
    const countsMap = {};
    values.forEach(v=>{ const k=String(v); countsMap[k]=(countsMap[k]||0)+1; });
    const pairs = Object.entries(countsMap).sort((a,b)=> b[1]-a[1]).slice(0,12);
    labels1 = pairs.map(p=>p[0]); data1 = pairs.map(p=>p[1]);
  }

  // chart1 config
  const dataObj1 = { labels: labels1, datasets: [{ label: col, data: data1 }] };
  const cfg1 = { type: (type==='line'?'line': (type==='pie'?'pie':'bar')), data: dataObj1, options:{ responsive:true, maintainAspectRatio:false } };

  // secondary chart (if col2)
  let cfg2 = null;
  if(col2){
    const vals2 = rows.map(r=> r[col2]).filter(v=> v !== null && v !== undefined && v !== '');
    const numeric2 = vals2.filter(v=> typeof v === 'number' && !isNaN(v));
    if(numeric2.length>0){
      // show distribution
      const min = Math.min(...numeric2), max = Math.max(...numeric2);
      const bins=10; const step=(max-min)/bins||1; const counts=Array(bins).fill(0);
      numeric2.forEach(v=>{ let idx=Math.floor((v-min)/step); if(idx<0)idx=0; if(idx>=bins)idx=bins-1; counts[idx]++; });
      const labels2 = counts.map((_,i)=> (min + i*step).toFixed(2)+'-'+(min + (i+1)*step).toFixed(2));
      cfg2 = { type:'bar', data:{ labels:labels2, datasets:[{ label: col2, data:counts }] }, options:{ responsive:true, maintainAspectRatio:false } };
    } else {
      const countsMap = {}; vals2.forEach(v=>{ const k=String(v); countsMap[k]=(countsMap[k]||0)+1; });
      const pairs = Object.entries(countsMap).sort((a,b)=> b[1]-a[1]).slice(0,10);
      const labels2 = pairs.map(p=>p[0]); const data2 = pairs.map(p=>p[1]);
      cfg2 = { type:'pie', data:{ labels:labels2, datasets:[{ label:col2, data:data2 }] }, options:{ responsive:true, maintainAspectRatio:false } };
    }
  }

  // draw charts
  if(chart1) chart1.destroy();
  chart1 = new Chart(chartCanvas1, cfg1);
  if(chart2) chart2.destroy();
  if(cfg2) chart2 = new Chart(chartCanvas2, cfg2);
  else {
    // clear second canvas
    const ctx = chartCanvas2.getContext('2d'); ctx.clearRect(0,0,chartCanvas2.width, chartCanvas2.height);
    if(chart2){ chart2.destroy(); chart2=null; }
  }

  document.getElementById('chart-desc').textContent = col + (col2? (' • ' + col2): '');
}

function setupDownloadButtons(rows){
  downloadJsonBtn.disabled = false; downloadCsvBtn.disabled = false;
  downloadJsonBtn.onclick = ()=> downloadJSON(rows);
  downloadCsvBtn.onclick = ()=> downloadCSV(rows);
}

function downloadJSON(rows){
  const blob = new Blob([JSON.stringify(rows,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'data.json'; a.click(); URL.revokeObjectURL(url);
}

function downloadCSV(rows){
  if(!rows || !rows.length) return;
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(',')];
  rows.forEach(r=> lines.push(cols.map(c=> JSON.stringify(r[c]===null? '' : r[c])).join(',')));
  const blob = new Blob([lines.join('\n')], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'data_export.csv'; a.click(); URL.revokeObjectURL(url);
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// click to open file dialog
dropZone.addEventListener('click', ()=> fileInput.click());
