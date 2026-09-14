const APP_VERSION='2.0.0';
const SCOPE='https://www.googleapis.com/auth/drive.file';
const CLIENT_ID_KEY='expedientes_google_client_id_v2';
const APP_PROP_KEY='expedientesMedicos';
const DB_PROP='database_v2';
const ROOT_PROP='root_folder_v2';

const SCHEMA={
  Patients:['id','fullName','birthDate','phone','diagnosis','generalNotes','treatmentTotal','folderId','createdAt','updatedAt','deletedAt'],
  Visits:['id','patientId','date','reason','progress','plan','createdAt','updatedAt','deletedAt'],
  Payments:['id','patientId','date','amount','concept','createdAt','updatedAt','deletedAt'],
  Files:['id','patientId','name','mimeType','size','description','driveFileId','driveUrl','createdAt','updatedAt','deletedAt']
};

let accessToken='';
let tokenClient=null;
let accountInfo=null;
let storage={spreadsheetId:'',rootFolderId:''};
let records={patients:[],visits:[],payments:[],files:[]};
let currentPatientId=null;
let connectResolve=null;
let connectReject=null;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0));
const today=()=>new Date().toISOString().slice(0,10);
const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random().toString(16).slice(2)}`;
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const cleanFolderName=s=>String(s||'Paciente').replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim().slice(0,100)||'Paciente';

function getClientId(){
  return localStorage.getItem(CLIENT_ID_KEY)||window.EXPEDIENTES_CONFIG?.googleClientId||'';
}
function setClientId(v){
  const value=String(v||'').trim();
  if(value)localStorage.setItem(CLIENT_ID_KEY,value); else localStorage.removeItem(CLIENT_ID_KEY);
  tokenClient=null;
  updateSetupState();
}
function busy(on=true,text='Sincronizando…'){
  $('#loader').classList.toggle('hidden',!on);
  $('#loaderText').textContent=text;
}
function toast(msg){
  const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');
  setTimeout(()=>t.classList.add('hidden'),2400);
}
function friendlyError(err){
  const text=String(err?.message||err||'Ocurrió un error');
  if(text.includes('401')||text.includes('Invalid Credentials')){
    markDisconnected('La sesión de Google venció. Toca “Conectar con Google” nuevamente.');
  }
  console.error(err);
  alert(text);
}

function showView(id){
  if(id==='patientsView'&&!accessToken){id='setupView';}
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===id));
  $$('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
  $('#addPatientTop').classList.toggle('hidden',id!=='patientsView'||!accessToken);
  if(id==='patientsView'){
    currentPatientId=null;
    $('#pageTitle').textContent='Pacientes';
    $('#pageSubtitle').textContent='Expedientes sincronizados con Google Drive.';
    renderPatients();
  } else if(id==='settingsView'){
    currentPatientId=null;
    $('#pageTitle').textContent='Ajustes';
    $('#pageSubtitle').textContent='Google Drive y almacenamiento.';
    renderSettings();
  } else if(id==='setupView'){
    $('#pageTitle').textContent='Expedientes Médicos';
    $('#pageSubtitle').textContent='Conecta Google para acceder a los pacientes.';
  }
}

function updateSetupState(){
  const id=getClientId();
  $('#clientIdMissing').classList.toggle('hidden',!!id);
  $('#setupConnectBtn').disabled=!id;
  $('#connectGoogleBtn').disabled=!id;
  $('#settingsConnect').disabled=!id;
  $('#googleClientId').value=id;
}
function markConnected(){
  const banner=$('#cloudBanner');
  banner.classList.remove('disconnected');banner.classList.add('connected');
  $('#cloudStatus').textContent='Google Drive conectado';
  $('#cloudDetail').textContent=accountInfo?.emailAddress?accountInfo.emailAddress:'Datos sincronizados en la nube';
  $('#connectGoogleBtn').textContent='Renovar acceso';
  $('#settingsConnection').textContent=accountInfo?.emailAddress||'Conectada';
}
function markDisconnected(detail='Conecta la cuenta que será dueña de los expedientes.'){
  accessToken='';accountInfo=null;
  const banner=$('#cloudBanner');
  banner.classList.add('disconnected');banner.classList.remove('connected');
  $('#cloudStatus').textContent='Google no conectado';
  $('#cloudDetail').textContent=detail;
  $('#connectGoogleBtn').textContent='Conectar con Google';
  $('#settingsConnection').textContent='No conectada';
}

async function waitForGoogle(){
  for(let i=0;i<60;i++){
    if(window.google?.accounts?.oauth2)return;
    await new Promise(r=>setTimeout(r,100));
  }
  throw new Error('No se pudo cargar Google Identity Services. Revisa tu conexión a internet.');
}
async function ensureTokenClient(){
  const clientId=getClientId();
  if(!clientId)throw new Error('Primero configura el Google OAuth Client ID en Ajustes.');
  await waitForGoogle();
  if(tokenClient)return tokenClient;
  tokenClient=google.accounts.oauth2.initTokenClient({
    client_id:clientId,
    scope:SCOPE,
    callback:response=>{
      if(response?.error){connectReject?.(new Error(response.error_description||response.error));return;}
      accessToken=response.access_token||'';
      connectResolve?.(response);
    },
    error_callback:e=>connectReject?.(new Error(e?.message||e?.type||'No se pudo abrir Google'))
  });
  return tokenClient;
}
async function connectGoogle(){
  // En Vercel usamos el flujo OAuth del servidor. Esto funciona de forma
  // consistente en Chrome, Firefox y accesos directos instalados en Android.
  const serverOauthMode=/\.vercel\.app$/i.test(location.hostname)||location.hostname==='localhost';
  if(serverOauthMode){
    window.location.assign('/api/auth-start');
    return;
  }
  try{
    const tc=await ensureTokenClient();
    busy(true,'Conectando con Google…');
    await new Promise((resolve,reject)=>{
      connectResolve=resolve;connectReject=reject;
      tc.requestAccessToken({prompt:accessToken?'':'consent'});
    });
    accountInfo=await apiJson('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)');
    accountInfo=accountInfo?.user||null;
    await ensureStorage();
    await refreshData();
    markConnected();
    showView('patientsView');
    toast('Google Drive conectado');
  }catch(err){friendlyError(err);}finally{busy(false);connectResolve=null;connectReject=null;}
}

async function apiFetch(url,opts={}){
  if(!accessToken)throw new Error('Google no está conectado.');
  const headers=new Headers(opts.headers||{});
  headers.set('Authorization',`Bearer ${accessToken}`);
  const res=await fetch(url,{...opts,headers});
  if(!res.ok){
    const txt=await res.text().catch(()=>res.statusText);
    if(res.status===401)markDisconnected('La sesión venció. Vuelve a conectar Google.');
    throw new Error(`Google API ${res.status}: ${txt.slice(0,500)}`);
  }
  return res;
}
async function apiJson(url,opts={}){
  const res=await apiFetch(url,opts);
  if(res.status===204)return null;
  return res.json();
}

async function findDriveObject(propValue,mimeType=''){
  let q=`appProperties has { key='${APP_PROP_KEY}' and value='${propValue}' } and trashed=false`;
  if(mimeType)q+=` and mimeType='${mimeType}'`;
  const url=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=${encodeURIComponent('files(id,name,mimeType,webViewLink,appProperties)')}&pageSize=10`;
  const out=await apiJson(url);
  return out.files?.[0]||null;
}
async function createRootFolder(){
  return apiJson('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Expedientes Médicos - Archivos',mimeType:'application/vnd.google-apps.folder',appProperties:{[APP_PROP_KEY]:ROOT_PROP}})});
}
async function createDatabase(){
  const body={properties:{title:'Expedientes Médicos - Datos'},sheets:Object.keys(SCHEMA).map(title=>({properties:{title}}))};
  const ss=await apiJson('https://sheets.googleapis.com/v4/spreadsheets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  await apiJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(ss.spreadsheetId)}?fields=id,name,webViewLink`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appProperties:{[APP_PROP_KEY]:DB_PROP}})});
  const data=Object.entries(SCHEMA).map(([sheet,headers])=>({range:`${sheet}!A1:${columnName(headers.length)}1`,majorDimension:'ROWS',values:[headers]}));
  await apiJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ss.spreadsheetId)}/values:batchUpdate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'RAW',data})});
  return {id:ss.spreadsheetId,name:'Expedientes Médicos - Datos'};
}
function columnName(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
async function ensureStorage(){
  busy(true,'Preparando almacenamiento seguro…');
  let db=await findDriveObject(DB_PROP,'application/vnd.google-apps.spreadsheet');
  if(!db)db=await createDatabase();
  let root=await findDriveObject(ROOT_PROP,'application/vnd.google-apps.folder');
  if(!root)root=await createRootFolder();
  storage={spreadsheetId:db.id,rootFolderId:root.id};
  renderSettings();
}

function rowsToObjects(values,schema){
  if(!values?.length)return[];
  const headers=values[0]?.length?values[0]:schema;
  return values.slice(1).filter(r=>r.some(v=>v!==''&&v!=null)).map(row=>{
    const o={};headers.forEach((h,i)=>o[h]=row[i]??'');return o;
  });
}
function latestActive(rows){
  const map=new Map();
  for(const row of rows){
    if(!row.id)continue;
    const old=map.get(String(row.id));
    if(!old||String(row.updatedAt||row.createdAt||'')>=String(old.updatedAt||old.createdAt||''))map.set(String(row.id),row);
  }
  return [...map.values()].filter(x=>!x.deletedAt);
}
async function refreshData(){
  if(!storage.spreadsheetId)return;
  busy(true,'Descargando expedientes…');
  const ranges=Object.keys(SCHEMA).map(s=>`${s}!A:${columnName(SCHEMA[s].length)}`);
  const params=ranges.map(r=>`ranges=${encodeURIComponent(r)}`).join('&');
  const out=await apiJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(storage.spreadsheetId)}/values:batchGet?${params}&majorDimension=ROWS`);
  const byTitle={};
  (out.valueRanges||[]).forEach((vr,i)=>byTitle[Object.keys(SCHEMA)[i]]=vr.values||[]);
  records.patients=latestActive(rowsToObjects(byTitle.Patients,SCHEMA.Patients));
  records.visits=latestActive(rowsToObjects(byTitle.Visits,SCHEMA.Visits));
  records.payments=latestActive(rowsToObjects(byTitle.Payments,SCHEMA.Payments));
  records.files=latestActive(rowsToObjects(byTitle.Files,SCHEMA.Files));
  renderPatients();
  busy(false);
}
async function appendRecord(sheet,obj){
  const headers=SCHEMA[sheet];
  const row=headers.map(h=>obj[h]??'');
  const range=`${sheet}!A:${columnName(headers.length)}`;
  return apiJson(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(storage.spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[row]})});
}

function patientFinance(id){
  const patient=records.patients.find(p=>String(p.id)===String(id));
  const payments=records.payments.filter(p=>String(p.patientId)===String(id));
  const paid=payments.reduce((s,p)=>s+Number(p.amount||0),0);
  const total=Number(patient?.treatmentTotal||0);
  return{total,paid,balance:Math.max(total-paid,0),payments};
}
function enrichedPatients(){
  return records.patients.map(p=>({...p,...patientFinance(p.id),visitsCount:records.visits.filter(v=>v.patientId===p.id).length,filesCount:records.files.filter(f=>f.patientId===p.id).length})).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}
function renderPatients(){
  if(!accessToken)return;
  const all=enrichedPatients();
  const q=$('#patientSearch').value.trim().toLowerCase();
  const filter=$('#balanceFilter').value;
  $('#totalPatients').textContent=all.length;
  $('#totalPending').textContent=money(all.reduce((s,p)=>s+p.balance,0));
  $('#totalPaid').textContent=money(all.reduce((s,p)=>s+p.paid,0));
  const rows=all.filter(p=>{
    const match=!q||`${p.fullName||''} ${p.diagnosis||''}`.toLowerCase().includes(q);
    const fm=filter==='all'||(filter==='pending'&&p.balance>0.009)||(filter==='paid'&&Number(p.treatmentTotal||0)>0&&p.balance<=0.009);
    return match&&fm;
  });
  $('#patientList').innerHTML=rows.map(p=>`<article class="patient-card" data-id="${esc(p.id)}"><div class="patient-row"><div><div class="patient-name">${esc(p.fullName)}</div><div class="patient-dx">${esc(p.diagnosis||'Sin diagnóstico registrado')}</div></div><span class="balance-pill ${p.balance>0.009?'pending':'paid'}">${Number(p.treatmentTotal||0)>0?(p.balance>0.009?'Saldo '+money(p.balance):'Liquidado'):'Sin total'}</span></div><div class="patient-meta"><span>🩺 ${p.visitsCount} consultas</span><span>📎 ${p.filesCount} archivos</span><span>💳 ${money(p.paid)} abonado</span></div></article>`).join('');
  $('#emptyPatients').classList.toggle('hidden',all.length!==0);
  $('#patientList').classList.toggle('hidden',all.length===0);
  $$('.patient-card').forEach(c=>c.onclick=()=>openPatient(c.dataset.id));
}
function openPatient(id){
  currentPatientId=id;
  const p=records.patients.find(x=>String(x.id)===String(id));
  if(!p)return;
  $$('.view').forEach(v=>v.classList.remove('active'));$('#patientView').classList.add('active');$$('.nav-btn').forEach(b=>b.classList.remove('active'));$('#addPatientTop').classList.add('hidden');
  $('#pageTitle').textContent=p.fullName;$('#pageSubtitle').textContent='Expediente sincronizado con Google Drive.';
  renderPatientDetail(p);
}
function renderPatientDetail(p){
  const f=patientFinance(p.id);
  const visits=records.visits.filter(v=>v.patientId===p.id).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const files=records.files.filter(x=>x.patientId===p.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  const payments=f.payments.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  $('#patientDetail').innerHTML=`<div class="detail-hero"><div class="hero-top"><div><div class="eyebrow" style="color:#bff4ea">EXPEDIENTE</div><h2>${esc(p.fullName)}</h2><div class="muted">${esc(p.birthDate||'Sin fecha de nacimiento')} · ${esc(p.phone||'Sin teléfono')}</div></div><div class="hero-actions"><button id="editPatient">Editar</button><button id="printPatient">PDF</button></div></div><p class="hero-dx"><strong>Diagnóstico:</strong> ${esc(p.diagnosis||'Sin diagnóstico registrado')}</p>${p.generalNotes?`<p class="hero-dx"><strong>Notas:</strong> ${esc(p.generalNotes)}</p>`:''}<div class="finance-grid"><div class="finance-box"><span>Total</span><strong>${money(f.total)}</strong></div><div class="finance-box"><span>Abonado</span><strong>${money(f.paid)}</strong></div><div class="finance-box"><span>Saldo</span><strong>${money(f.balance)}</strong></div></div></div>
  <div class="detail-actions"><button class="primary-btn" id="addVisit">＋ Registrar consulta</button><button class="secondary-btn" id="addPayment">＋ Registrar abono</button><button class="secondary-btn" id="addFile">＋ Subir archivo</button></div>
  <section class="section-card"><div class="section-head"><div><div class="eyebrow">EVOLUCIÓN</div><h3>Consultas y progreso</h3></div><span class="muted">${visits.length}</span></div><div class="timeline">${visits.length?visits.map(v=>`<div class="timeline-item"><strong>${esc(v.date)}${v.reason?' · '+esc(v.reason):''}</strong><p>${esc(v.progress)}</p>${v.plan?`<p class="muted"><b>Indicaciones:</b> ${esc(v.plan)}</p>`:''}<button class="text-btn danger delete-visit" data-id="${esc(v.id)}">Eliminar</button></div>`).join(''):'<p class="muted">Aún no hay consultas registradas.</p>'}</div></section>
  <section class="section-card"><div class="section-head"><div><div class="eyebrow">PAGOS</div><h3>Abonos</h3></div><span class="muted">${payments.length}</span></div>${payments.length?payments.map(x=>`<div class="payment-row"><div><strong>${money(x.amount)}</strong><small>${esc(x.date)} · ${esc(x.concept||'Abono')}</small></div><button class="text-btn danger delete-payment" data-id="${esc(x.id)}">Eliminar</button></div>`).join(''):'<p class="muted">No hay abonos registrados.</p>'}</section>
  <section class="section-card"><div class="section-head"><div><div class="eyebrow">GOOGLE DRIVE</div><h3>Imágenes y documentos</h3></div><span class="muted">${files.length}</span></div>${files.length?files.map(fileRowHtml).join(''):'<p class="muted">No hay archivos adjuntos.</p>'}</section>`;
  bindPatientDetail(p);
}
function fileRowHtml(f){
  const icon=String(f.mimeType||'').startsWith('image/')?'🖼️':String(f.mimeType||'').includes('pdf')?'📕':'📄';
  return `<div class="file-row"><div class="file-main"><div class="file-icon">${icon}</div><div style="min-width:0"><div class="file-name">${esc(f.name)}</div><small>${esc(f.description||f.mimeType||'Archivo')}</small></div></div><div class="file-actions"><a href="${esc(f.driveUrl)}" target="_blank" rel="noopener">Ver</a><button class="delete-file" data-id="${esc(f.id)}">✕</button></div></div>`;
}
function bindPatientDetail(p){
  $('#editPatient').onclick=()=>openPatientDialog(p);
  $('#printPatient').onclick=()=>window.print();
  $('#addVisit').onclick=()=>{$('#visitForm').reset();$('#visitDate').value=today();$('#visitDialog').showModal()};
  $('#addPayment').onclick=()=>{$('#paymentForm').reset();$('#paymentDate').value=today();$('#paymentDialog').showModal()};
  $('#addFile').onclick=()=>{$('#fileForm').reset();$('#fileDialog').showModal()};
  $$('.delete-visit').forEach(b=>b.onclick=()=>deleteRecord('Visits',b.dataset.id,'¿Eliminar esta consulta?'));
  $$('.delete-payment').forEach(b=>b.onclick=()=>deleteRecord('Payments',b.dataset.id,'¿Eliminar este abono?'));
  $$('.delete-file').forEach(b=>b.onclick=()=>deleteFileRecord(b.dataset.id));
}
function openPatientDialog(p=null){
  $('#patientForm').reset();
  $('#patientDialogTitle').textContent=p?'Editar paciente':'Nuevo paciente';
  $('#patientId').value=p?.id||'';$('#patientCreatedAt').value=p?.createdAt||'';$('#patientFolderId').value=p?.folderId||'';
  $('#fullName').value=p?.fullName||'';$('#birthDate').value=p?.birthDate||'';$('#phone').value=p?.phone||'';$('#diagnosis').value=p?.diagnosis||'';$('#generalNotes').value=p?.generalNotes||'';$('#treatmentTotal').value=p?.treatmentTotal??0;
  $('#patientDialog').showModal();
}
async function createPatientFolder(name,id){
  const meta={name:`${cleanFolderName(name)} - ${String(id).slice(0,8)}`,mimeType:'application/vnd.google-apps.folder',parents:[storage.rootFolderId],appProperties:{[APP_PROP_KEY]:'patient_folder_v2',patientId:String(id)}};
  return apiJson('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)});
}
async function renamePatientFolder(folderId,name,id){
  if(!folderId)return;
  try{await apiJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`${cleanFolderName(name)} - ${String(id).slice(0,8)}`})});}catch(e){console.warn(e)}
}

$('#patientForm').onsubmit=async e=>{
  e.preventDefault();
  try{
    busy(true,'Guardando paciente…');
    const id=$('#patientId').value||uid();
    let folderId=$('#patientFolderId').value||'';
    if(!folderId){const folder=await createPatientFolder($('#fullName').value.trim(),id);folderId=folder.id;}
    const createdAt=$('#patientCreatedAt').value||now();
    const obj={id,fullName:$('#fullName').value.trim(),birthDate:$('#birthDate').value,phone:$('#phone').value.trim(),diagnosis:$('#diagnosis').value.trim(),generalNotes:$('#generalNotes').value.trim(),treatmentTotal:Number($('#treatmentTotal').value||0),folderId,createdAt,updatedAt:now(),deletedAt:''};
    await appendRecord('Patients',obj);await renamePatientFolder(folderId,obj.fullName,id);
    $('#patientDialog').close();await refreshData();toast('Paciente guardado');openPatient(id);
  }catch(err){friendlyError(err);}finally{busy(false);}
};
$('#visitForm').onsubmit=async e=>{
  e.preventDefault();
  try{busy(true,'Guardando consulta…');const obj={id:uid(),patientId:currentPatientId,date:$('#visitDate').value,reason:$('#visitReason').value.trim(),progress:$('#visitProgress').value.trim(),plan:$('#visitPlan').value.trim(),createdAt:now(),updatedAt:now(),deletedAt:''};await appendRecord('Visits',obj);$('#visitDialog').close();await refreshData();toast('Consulta registrada');openPatient(currentPatientId);}catch(err){friendlyError(err);}finally{busy(false);}
};
$('#paymentForm').onsubmit=async e=>{
  e.preventDefault();
  try{busy(true,'Guardando abono…');const obj={id:uid(),patientId:currentPatientId,date:$('#paymentDate').value,amount:Number($('#paymentAmount').value||0),concept:$('#paymentConcept').value.trim(),createdAt:now(),updatedAt:now(),deletedAt:''};await appendRecord('Payments',obj);$('#paymentDialog').close();await refreshData();toast('Abono registrado');openPatient(currentPatientId);}catch(err){friendlyError(err);}finally{busy(false);}
};
async function deleteRecord(sheet,id,question){
  if(!confirm(question))return;
  try{
    busy(true,'Actualizando expediente…');
    const key=sheet==='Visits'?'visits':'payments';
    const row=records[key].find(x=>String(x.id)===String(id));if(!row)return;
    await appendRecord(sheet,{...row,updatedAt:now(),deletedAt:now()});await refreshData();toast('Registro eliminado');openPatient(currentPatientId);
  }catch(err){friendlyError(err);}finally{busy(false);}
}
async function uploadFileMultipart(file,patient){
  let folderId=patient.folderId;
  if(!folderId){const folder=await createPatientFolder(patient.fullName,patient.id);folderId=folder.id;patient={...patient,folderId,updatedAt:now()};await appendRecord('Patients',patient);}
  const metadata={name:file.name,parents:[folderId],appProperties:{[APP_PROP_KEY]:'patient_file_v2',patientId:String(patient.id)}};
  const boundary='-------expedientes_'+Math.random().toString(16).slice(2);
  const prefix=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type||'application/octet-stream'}\r\n\r\n`;
  const suffix=`\r\n--${boundary}--`;
  const body=new Blob([prefix,file,suffix]);
  const res=await apiFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
  return res.json();
}
$('#fileForm').onsubmit=async e=>{
  e.preventDefault();
  const file=$('#patientFile').files[0];if(!file)return;
  try{
    busy(true,'Subiendo archivo a Google Drive…');
    const patient=records.patients.find(p=>p.id===currentPatientId);if(!patient)throw new Error('Paciente no encontrado');
    const d=await uploadFileMultipart(file,patient);
    const obj={id:uid(),patientId:patient.id,name:d.name||file.name,mimeType:d.mimeType||file.type,size:Number(d.size||file.size||0),description:$('#fileDescription').value.trim(),driveFileId:d.id,driveUrl:d.webViewLink||`https://drive.google.com/file/d/${d.id}/view`,createdAt:now(),updatedAt:now(),deletedAt:''};
    await appendRecord('Files',obj);$('#fileDialog').close();await refreshData();toast('Archivo guardado en Drive');openPatient(currentPatientId);
  }catch(err){friendlyError(err);}finally{busy(false);}
};
async function deleteFileRecord(id){
  if(!confirm('¿Eliminar este archivo del expediente y de Google Drive?'))return;
  try{
    busy(true,'Eliminando archivo…');
    const row=records.files.find(x=>x.id===id);if(!row)return;
    if(row.driveFileId){try{await apiFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(row.driveFileId)}`,{method:'DELETE'});}catch(e){console.warn(e)}}
    await appendRecord('Files',{...row,updatedAt:now(),deletedAt:now()});await refreshData();toast('Archivo eliminado');openPatient(currentPatientId);
  }catch(err){friendlyError(err);}finally{busy(false);}
}

function renderSettings(){
  $('#googleClientId').value=getClientId();
  $('#settingsConnection').textContent=accessToken?(accountInfo?.emailAddress||'Conectada'):'No conectada';
  $('#settingsSheet').textContent=storage.spreadsheetId?'Lista':'—';
  $('#settingsFolder').textContent=storage.rootFolderId?'Lista':'—';
  if(storage.spreadsheetId){$('#openSheet').href=`https://docs.google.com/spreadsheets/d/${storage.spreadsheetId}/edit`;$('#openSheet').classList.remove('hidden');}else $('#openSheet').classList.add('hidden');
  if(storage.rootFolderId){$('#openFolder').href=`https://drive.google.com/drive/folders/${storage.rootFolderId}`;$('#openFolder').classList.remove('hidden');}else $('#openFolder').classList.add('hidden');
}

$('#connectGoogleBtn').onclick=connectGoogle;$('#setupConnectBtn').onclick=connectGoogle;$('#settingsConnect').onclick=connectGoogle;
// Refuerzo para Android/Firefox: navegación directa al OAuth del servidor.
if(/\.vercel\.app$/i.test(location.hostname)||location.hostname==='localhost'){
  ['connectGoogleBtn','setupConnectBtn','settingsConnect'].forEach(id=>{
    const el=document.getElementById(id);
    if(el){
      el.disabled=false;
      el.onclick=e=>{e?.preventDefault?.();window.location.assign('/api/auth-start');};
    }
  });
}
$('#saveClientId').onclick=()=>{const v=$('#googleClientId').value.trim();if(!v.endsWith('.apps.googleusercontent.com')){alert('Pega un OAuth Client ID válido que termine en .apps.googleusercontent.com');return;}setClientId(v);toast('Client ID guardado');};
$('#clearClientId').onclick=()=>{if(confirm('¿Quitar el Client ID guardado de este dispositivo?')){setClientId('');markDisconnected();toast('Client ID eliminado');}};
$('#goToSettings').onclick=()=>showView('settingsView');
$('#patientSearch').oninput=renderPatients;$('#balanceFilter').onchange=renderPatients;
$('#addPatientTop').onclick=()=>openPatientDialog();$('#emptyAddPatient').onclick=()=>openPatientDialog();$('#backToPatients').onclick=()=>showView('patientsView');
$$('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
$$('.nav-btn').forEach(b=>b.onclick=()=>showView(b.dataset.view));
$('#visitDate').value=today();$('#paymentDate').value=today();

if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
updateSetupState();markDisconnected();renderSettings();showView('setupView');
