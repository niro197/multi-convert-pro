/* ================================================================
   PDFShift — Logique complete (12 outils, overlay, Stripe)
   ================================================================ */

// ===== STRIPE CONFIG =====
const STRIPE_PUBLIC_KEY = 'VOTRE_CLE_PUBLIQUE_STRIPE';
const STRIPE_PRICE_ID   = 'VOTRE_ID_PRIX';
let stripeInstance = null;

// ===== PDF.js =====
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ===== CONSTANTES =====
const FREE_LIMIT = 3;
const CYCLE_MS = 48 * 60 * 60 * 1000;

// ===== ETAT =====
let currentUser = null;
let currentTool = 'pdf-to-text';
let uploadedFiles = [];
let conversionResult = null;

// ===== 12 OUTILS =====
const TOOLS = {
  'pdf-to-text':    { title:'PDF vers Texte',     desc:'Extrayez le texte de vos PDF',             icon:'fa-file-alt',    color:'#0A7CFF', bg:'#EEF4FF', accept:'.pdf',                multiple:false, hasText:false, pro:false, outIcon:'fa-file-alt',    outLabel:'TXT' },
  'image-to-pdf':   { title:'Image vers PDF',     desc:'Transformez vos images en PDF',            icon:'fa-file-image',  color:'#059669', bg:'#ECFDF5', accept:'.jpg,.jpeg,.png',    multiple:true,  hasText:false, pro:false, outIcon:'fa-file-pdf',    outLabel:'PDF' },
  'text-to-pdf':    { title:'Texte vers PDF',     desc:'Convertissez votre texte en PDF',          icon:'fa-pen-nib',     color:'#D97706', bg:'#FEF3C7', accept:null,                  multiple:false, hasText:true,  pro:false, outIcon:'fa-file-pdf',    outLabel:'PDF' },
  'pdf-to-image':   { title:'PDF vers Image',     desc:'Convertissez vos pages en images PNG',     icon:'fa-image',       color:'#0EA5E9', bg:'#E0F2FE', accept:'.pdf',                multiple:false, hasText:false, pro:true,  outIcon:'fa-image',       outLabel:'PNG' },
  'pdf-to-word':    { title:'PDF vers Word',      desc:'Exportez vers un document Word',           icon:'fa-file-word',   color:'#2563EB', bg:'#DBEAFE', accept:'.pdf',                multiple:false, hasText:false, pro:true,  outIcon:'fa-file-word',   outLabel:'DOCX' },
  'pdf-to-excel':   { title:'PDF vers Excel',     desc:'Extrayez les donnees en tableur',          icon:'fa-file-excel',  color:'#16A34A', bg:'#DCFCE7', accept:'.pdf',                multiple:false, hasText:false, pro:true,  outIcon:'fa-file-excel',  outLabel:'CSV' },
  'merge-pdf':      { title:'Fusionner PDF',      desc:'Combinez plusieurs PDF en un seul',        icon:'fa-layer-group', color:'#DC2626', bg:'#FEE2E2', accept:'.pdf',                multiple:true,  hasText:false, pro:true,  outIcon:'fa-file-pdf',    outLabel:'PDF' },
  'html-to-pdf':    { title:'HTML vers PDF',      desc:'Convertissez votre code HTML en PDF',      icon:'fa-code',        color:'#7C3AED', bg:'#F3E8FF', accept:null,                  multiple:false, hasText:true,  pro:true,  outIcon:'fa-file-pdf',    outLabel:'PDF' },
  'split-pdf':      { title:'Diviser PDF',        desc:'Extrayez des pages specifiques',           icon:'fa-cut',         color:'#E11D48', bg:'#FFE4E6', accept:'.pdf',                multiple:false, hasText:false, pro:true,  outIcon:'fa-file-pdf',    outLabel:'PDF' },
  'rotate-pdf':     { title:'Pivoter PDF',        desc:'Tournez les pages de votre PDF',           icon:'fa-redo',        color:'#0891B2', bg:'#CFFAFE', accept:'.pdf',                multiple:false, hasText:false, pro:true,  outIcon:'fa-file-pdf',    outLabel:'PDF' },
  'watermark-pdf':  { title:'Filigrane PDF',      desc:'Ajoutez un filigrane a vos pages',         icon:'fa-stamp',       color:'#CA8A04', bg:'#FEF9C3', accept:'.pdf',                multiple:false, hasText:false, pro:true,  outIcon:'fa-file-pdf',    outLabel:'PDF' },
  'compress-pdf':   { title:'Compresser PDF',     desc:'Reduisez la taille de votre PDF',          icon:'fa-compress-alt',color:'#64748B', bg:'#F1F5F9', accept:'.pdf',                multiple:false, hasText:false, pro:true,  outIcon:'fa-file-pdf',    outLabel:'PDF' }
};

// ===== LOCALSTORAGE =====
function getUsers(){ return JSON.parse(localStorage.getItem('pdfshift_users')||'{}'); }
function saveUsers(u){ localStorage.setItem('pdfshift_users',JSON.stringify(u)); }
function getUser(){ const id=localStorage.getItem('pdfshift_session'); if(!id)return null; return getUsers()[id]||null; }
function saveUser(u){ const us=getUsers(); us[u.id]=u; saveUsers(us); currentUser=u; }

// ===== LIMITES =====
function refreshCycle(u){ const n=Date.now(); if(!u.cycleStart){u.cycleStart=n;u.cycleUsed=0;saveUser(u);return;} if(n-u.cycleStart>=CYCLE_MS){u.cycleStart=n;u.cycleUsed=0;saveUser(u);} }
function getRemaining(u){ if(u.isPro)return Infinity; refreshCycle(u); return Math.max(0,FREE_LIMIT-(u.cycleUsed||0)); }
function consume(u){ if(u.isPro){u.totalConversions=(u.totalConversions||0)+1;saveUser(u);return true;} if(getRemaining(u)<=0)return false; u.cycleUsed=(u.cycleUsed||0)+1; u.totalConversions=(u.totalConversions||0)+1; saveUser(u); return true; }
function getTimeLeft(u){ refreshCycle(u); return Math.max(0,CYCLE_MS-(Date.now()-u.cycleStart)); }
function fmtTime(ms){ const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return h>0?h+'h '+String(m).padStart(2,'0')+'min':m+'min '+String(sec).padStart(2,'0')+'s'; }
function fmtSize(b){ if(b<1024)return b+' o'; if(b<1048576)return(b/1024).toFixed(1)+' Ko'; return(b/1048576).toFixed(2)+' Mo'; }

// ===== NAVIGATION =====
function navigate(page){
  if(page==='dashboard'&&!getUser()){openModal('login');toast('Connectez-vous','info');return;}
  const cur=document.querySelector('.page-visible');
  const next=document.getElementById('page-'+page);
  if(!next||cur===next)return;
  cur.style.opacity='0'; cur.style.transform='translateY(8px)';
  setTimeout(()=>{
    cur.classList.replace('page-visible','page-hidden');
    cur.style.opacity=''; cur.style.transform='';
    next.classList.replace('page-hidden','page-visible');
    next.style.opacity='0'; next.style.transform='translateY(8px)';
    requestAnimationFrame(()=>{next.style.opacity='1';next.style.transform='translateY(0)';});
  },200);
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
  document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
  if(page==='dashboard')refreshDashboard();
}

// ===== TOAST =====
function toast(msg,type='info'){
  const c=document.getElementById('toastContainer');
  const icons={success:'fa-check-circle',error:'fa-exclamation-circle',warning:'fa-exclamation-triangle',info:'fa-info-circle'};
  const t=document.createElement('div');
  t.className='toast toast-'+type;
  t.innerHTML='<i class="fas '+icons[type]+'"></i> '+msg;
  c.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(-8px)';t.style.transition='all .3s';setTimeout(()=>t.remove(),300);},4000);
}

// ===== MODALS =====
function openModal(id){ document.getElementById('modalOverlay').style.display='flex'; document.querySelectorAll('.modal').forEach(m=>m.style.display='none'); document.getElementById('modal-'+id).style.display='block'; document.body.style.overflow='hidden'; }
function closeModal(){ document.getElementById('modalOverlay').style.display='none'; document.body.style.overflow=''; }
function switchModal(id){ document.querySelectorAll('.modal').forEach(m=>m.style.display='none'); document.getElementById('modal-'+id).style.display='block'; }

// ===== AUTH =====
function handleRegister(e){
  e.preventDefault();
  const name=document.getElementById('regName').value.trim();
  const email=document.getElementById('regEmail').value.trim().toLowerCase();
  const pw=document.getElementById('regPassword').value;
  const pw2=document.getElementById('regPasswordConfirm').value;
  if(pw!==pw2){toast('Mots de passe differents','error');return;}
  const users=getUsers();
  if(Object.values(users).find(u=>u.email===email)){toast('E-mail deja utilise','error');return;}
  const user={id:'u_'+Date.now(),name,email,password:btoa(pw),isPro:false,cycleStart:Date.now(),cycleUsed:0,totalConversions:0,history:[],createdAt:Date.now()};
  users[user.id]=user; saveUsers(users); localStorage.setItem('pdfshift_session',user.id);
  currentUser=user; closeModal(); updateNav(); toast('Bienvenue '+name+' !','success');
}
function handleLogin(e){
  e.preventDefault();
  const email=document.getElementById('loginEmail').value.trim().toLowerCase();
  const pw=document.getElementById('loginPassword').value;
  const users=getUsers();
  const user=Object.values(users).find(u=>u.email===email);
  if(!user||atob(user.password)!==pw){toast('Identifiants incorrects','error');return;}
  localStorage.setItem('pdfshift_session',user.id);
  currentUser=user; closeModal(); updateNav(); toast('Bon retour, '+user.name+' !','success');
}
function logout(){ localStorage.removeItem('pdfshift_session'); currentUser=null; updateNav(); navigate('home'); toast('Deconnecte','info'); }
function togglePassword(id,btn){ const inp=document.getElementById(id); const icon=btn.querySelector('i'); if(inp.type==='password'){inp.type='text';icon.className='fas fa-eye-slash';}else{inp.type='password';icon.className='fas fa-eye';} }
function checkPasswordStrength(pw){
  const bars=document.querySelectorAll('#strengthBars>div'), txt=document.getElementById('strengthText');
  let s=0; if(pw.length>=6)s++; if(pw.length>=10)s++; if(/[A-Z]/.test(pw)&&/[a-z]/.test(pw))s++; if(/[0-9]/.test(pw)&&/[^A-Za-z0-9]/.test(pw))s++;
  const colors=['#E5E7EB','#DC2626','#D97706','#0A7CFF','#059669'], labels=['','Faible','Moyen','Bon','Excellent'];
  bars.forEach((b,i)=>b.style.background=i<s?colors[s]:'#E5E7EB');
  txt.textContent=pw.length>0?labels[s]:''; txt.style.color=colors[s];
}

// ===== NAV UPDATE =====
function updateNav(){
  const user=getUser(), auth=document.getElementById('navAuth'), dash=document.getElementById('navDashboard');
  if(user){
    dash.style.display='inline-flex';
    auth.innerHTML=`<div style="display:flex;align-items:center;gap:8px;"><div style="width:30px;height:30px;background:#EEF4FF;border-radius:8px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-user" style="color:#0A7CFF;font-size:12px;"></i></div><span style="font-size:13px;font-weight:600;color:var(--fg2);">${user.name}</span>${user.isPro?'<span style="background:#EEF4FF;color:#0A7CFF;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">PRO</span>':''}</div><button class="btn-text" onclick="logout()" style="color:#DC2626;font-size:13px;"><i class="fas fa-sign-out-alt"></i></button>`;
  } else {
    dash.style.display='none';
    auth.innerHTML='<button class="btn-text" onclick="openModal(\'login\')">Connexion</button><button class="btn-primary-sm" onclick="openModal(\'register\')">S\'inscrire</button>';
  }
}

// ===== GENERER GRILLE D'OUTILS =====
function buildToolsGrid(){
  const grid=document.getElementById('heroToolsGrid');
  grid.innerHTML='';
  let i=0;
  for(const[id,t]of Object.entries(TOOLS)){
    const card=document.createElement('div');
    card.className='hero-tool-card anim-up anim-up-'+(i+1);
    card.onclick=()=>selectTool(id);
    card.innerHTML=`
      <div class="hero-tool-icon" style="background:${t.bg};color:${t.color};"><i class="fas ${t.icon}"></i></div>
      <div><div class="hero-tool-name">${t.title}</div><div class="hero-tool-desc">${t.desc}</div></div>
      ${t.pro?'<div class="hero-tool-lock"><i class="fas fa-lock"></i> Pro</div>':''}
    `;
    grid.appendChild(card);
    i++;
  }
}

// ===== SELECTION D'OUTIL =====
function selectTool(id){
  const t=TOOLS[id];
  // Verifier Pro
  if(t.pro){
    const user=getUser();
    if(!user){openModal('login');toast('Connectez-vous pour utiliser cet outil','warning');return;}
    if(!user.isPro){openModal('pro-lock');return;}
  }
  currentTool=id;
  document.getElementById('toolTitle').textContent=t.title;
  document.getElementById('toolDesc').textContent=t.desc;
  const icon=document.getElementById('toolIcon');
  icon.innerHTML='<i class="fas '+t.icon+'"></i>';
  icon.style.background=t.bg; icon.style.color=t.color;
  document.getElementById('toolProBadge').style.display=t.pro?'inline-flex':'none';

  const fi=document.getElementById('fileInput');
  if(t.accept){fi.accept=t.accept;fi.multiple=t.multiple;document.getElementById('acceptedFormats').textContent='Formats : '+t.accept.toUpperCase().replace(/\./g,'').replace(/,/g,', ');document.getElementById('dropZone').style.display='block';}
  else{document.getElementById('dropZone').style.display='none';}

  document.getElementById('textInputArea').style.display=t.hasText?'block':'none';
  document.getElementById('textInput').value='';
  document.getElementById('textInput').placeholder=id==='text-to-pdf'?'Collez votre texte ici...':'Collez votre code HTML ici...';

  document.getElementById('pageRangeArea').style.display=id==='split-pdf'?'block':'none';
  document.getElementById('watermarkArea').style.display=id==='watermark-pdf'?'block':'none';

  uploadedFiles=[]; conversionResult=null; resetToolUI(); updateLimitUI(); navigate('tools');
}

function resetToolUI(){
  document.getElementById('dropContent').style.display='block';
  document.getElementById('filePreview').style.display='none';
  document.getElementById('convertBtn').disabled=true;
  document.getElementById('resultArea').style.display='none';
  document.getElementById('textResult').style.display='none';
}
function clearFile(){ uploadedFiles=[]; document.getElementById('fileInput').value=''; resetToolUI(); }
function updateLimitUI(){
  const user=getUser(), banner=document.getElementById('limitBanner');
  if(user&&user.isPro){banner.style.display='none';return;}
  banner.style.display='flex';
  const rem=user?getRemaining(user):FREE_LIMIT;
  document.getElementById('limitText').textContent=rem+' conversion'+(rem!==1?'s':'')+' restante'+(rem!==1?'s':'');
  const fill=document.getElementById('limitProgress');
  fill.style.width=(rem/FREE_LIMIT*100)+'%';
  fill.style.background=rem===0?'#DC2626':rem===1?'#D97706':'#D97706';
}

// ===== UPLOAD =====
const dropZone=document.getElementById('dropZone'), fileInput=document.getElementById('fileInput');
dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('drag-over');});
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.classList.remove('drag-over');handleFiles(e.dataTransfer.files);});
fileInput.addEventListener('change',e=>handleFiles(e.target.files));

function handleFiles(files){
  if(!files||!files.length)return;
  const user=getUser();
  if(!user){toast('Connectez-vous','warning');openModal('login');return;}
  const t=TOOLS[currentTool];
  uploadedFiles=Array.from(files);
  for(const f of uploadedFiles){
    const ext='.'+f.name.split('.').pop().toLowerCase();
    if(t.accept&&!t.accept.includes(ext)){toast('Format non supporte : '+t.accept,'error');uploadedFiles=[];return;}
    const max=user.isPro?50*1024*1024:5*1024*1024;
    if(f.size>max){toast('Fichier trop volumineux (max '+(user.isPro?'50':'5')+' Mo)','error');uploadedFiles=[];return;}
  }
  document.getElementById('dropContent').style.display='none';
  const prev=document.getElementById('filePreview'); prev.style.display='flex';
  if(uploadedFiles.length===1){
    prev.querySelector('i').className='fas fa-file-pdf'; prev.querySelector('i').style.fontSize='36px';
    document.getElementById('fileName').textContent=uploadedFiles[0].name;
    document.getElementById('fileSize').textContent=fmtSize(uploadedFiles[0].size);
  } else {
    prev.querySelector('i').className='fas fa-copy'; prev.querySelector('i').style.fontSize='36px';
    document.getElementById('fileName').textContent=uploadedFiles.length+' fichiers';
    document.getElementById('fileSize').textContent=uploadedFiles.map(f=>fmtSize(f.size)).join(', ');
  }
  document.getElementById('convertBtn').disabled=false;
  updateLimitUI();
}

// ===== OVERLAY CONVERSION PLEIN ECRAN =====
function showOverlay(inIcon,inLabel,outIcon,outLabel){
  document.getElementById('cvFmtIn').innerHTML='<i class="fas '+inIcon+'"></i><span>'+inLabel+'</span>';
  document.getElementById('cvFmtOut').innerHTML='<i class="fas '+outIcon+'"></i><span>'+outLabel+'</span>';
  document.getElementById('cvFmtIn').classList.remove('done');
  document.getElementById('cvFmtOut').classList.remove('done');
  document.getElementById('cvArrowWrap').classList.remove('active');
  document.getElementById('cvRingCircle').style.strokeDashoffset='553';
  document.getElementById('cvRingCircle').style.stroke='#0A7CFF';
  document.getElementById('cvRingInner').classList.remove('done');
  document.getElementById('cvSpinIcon').style.display='block';
  document.getElementById('cvCheckIcon').style.display='none';
  document.getElementById('cvRingInner').querySelector('i').style.color='var(--blue)';
  document.getElementById('cvPercentText').textContent='0%';
  spawnOverlayParticles();
  document.getElementById('cvOverlay').classList.add('active');
  document.body.style.overflow='hidden';
}
function updateOverlay(pct,step){
  const offset=553-(553*pct/100);
  document.getElementById('cvRingCircle').style.strokeDashoffset=offset;
  document.getElementById('cvPercentText').textContent=Math.round(pct)+'%';
  document.getElementById('cvStepText').textContent=step;
  if(pct>15)document.getElementById('cvArrowWrap').classList.add('active');
  if(pct>40)document.getElementById('cvFmtIn').classList.add('done');
  if(pct>85)document.getElementById('cvFmtOut').classList.add('done');
}
function completeOverlay(){
  document.getElementById('cvRingCircle').style.stroke='#059669';
  document.getElementById('cvRingCircle').style.strokeDashoffset='0';
  document.getElementById('cvRingInner').classList.add('done');
  document.getElementById('cvSpinIcon').style.display='none';
  document.getElementById('cvCheckIcon').style.display='block';
  document.getElementById('cvStepText').textContent='Termine !';
  document.getElementById('cvPercentText').textContent='100%';
  document.getElementById('cvFmtOut').classList.add('done');
}
function hideOverlay(){
  document.getElementById('cvOverlay').classList.remove('active');
  document.body.style.overflow='';
}
function spawnOverlayParticles(){
  const c=document.getElementById('cvParticles');
  c.innerHTML='';
  for(let i=0;i<20;i++){
    const p=document.createElement('div');
    p.className='cv-particle';
    const angle=Math.random()*Math.PI*2;
    const dist=80+Math.random()*120;
    const x=50+Math.cos(angle)*dist;
    const y=50+Math.sin(angle)*dist;
    const size=2+Math.random()*4;
    const delay=Math.random()*2;
    const dur=2+Math.random()*3;
    p.style.cssText=`left:${x}%;top:${y}%;width:${size}px;height:${size}px;animation:pulse ${dur}s ${delay}s ease-in-out infinite;`;
    c.appendChild(p);
  }
}

// ===== CONVERSION =====
async function startConversion(){
  const user=getUser();
  if(!user){openModal('login');return;}
  const t=TOOLS[currentTool];
  if(!t.hasText&&!uploadedFiles.length){toast('Selectionnez un fichier','warning');return;}
  if(t.hasText&&!document.getElementById('textInput').value.trim()){toast('Saisissez du texte','warning');return;}
  if(!consume(user)){toast('Limite atteinte ! Renouvellement dans '+fmtTime(getTimeLeft(user)),'error');updateLimitUI();return;}

  document.getElementById('convertBtn').disabled=true;
  document.getElementById('resultArea').style.display='none';

  const inIcon='fa-file-pdf', inLabel='PDF';
  showOverlay(inIcon,inLabel,t.outIcon,t.outLabel);

  try{
    let result;
    // Animation progressive
    const steps=[
      {p:10,t:'Lecture du fichier...'},
      {p:30,t:'Analyse du contenu...'},
      {p:50,t:'Traitement en cours...'},
      {p:70,t:'Conversion...'},
      {p:90,t:'Finalisation...'},
    ];

    switch(currentTool){
      case 'pdf-to-text':    result=await cvPdfToText(steps); break;
      case 'image-to-pdf':   result=await cvImageToPdf(steps); break;
      case 'text-to-pdf':    result=await cvTextToPdf(steps); break;
      case 'pdf-to-image':   result=await cvPdfToImage(steps); break;
      case 'pdf-to-word':    result=await cvPdfToWord(steps); break;
      case 'pdf-to-excel':   result=await cvPdfToExcel(steps); break;
      case 'merge-pdf':      result=await cvMergePdf(steps); break;
      case 'html-to-pdf':    result=await cvHtmlToPdf(steps); break;
      case 'split-pdf':      result=await cvSplitPdf(steps); break;
      case 'rotate-pdf':     result=await cvRotatePdf(steps); break;
      case 'watermark-pdf':  result=await cvWatermarkPdf(steps); break;
      case 'compress-pdf':   result=await cvCompressPdf(steps); break;
    }

    completeOverlay();
    await delay(1200);
    hideOverlay();

    conversionResult=result;
    user.history.unshift({id:Date.now(),tool:currentTool,fileName:result.fileName,date:Date.now(),status:'ok'});
    if(user.history.length>50)user.history=user.history.slice(0,50);
    saveUser(user);
    showResult(result);
  }catch(err){
    console.error(err);
    hideOverlay();
    toast('Erreur : '+err.message,'error');
    document.getElementById('convertBtn').disabled=false;
  }
  updateLimitUI();
}

function delay(ms){return new Promise(r=>setTimeout(r,ms));}
function animSteps(steps,baseDur=400){
  return (async()=>{
    for(const s of steps){updateOverlay(s.p,s.t);await delay(baseDur+Math.random()*200);}
  })();
}

// Utilitaires lecture
function readAsUrl(f){return new Promise((r,j)=>{const re=new FileReader();re.onload=()=>r(re.result);re.onerror=j;re.readAsDataURL(f);});}
function loadImg(src){return new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=src;});}
function renderPageToCanvas(page,scale=1.5){
  const vp=page.getViewport({scale});
  const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
  return page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise.then(()=>({canvas:c,w:vp.width,h:vp.height}));
}

// ===== CONVERSIONS =====

// 1. PDF → Texte (gratuit)
async function cvPdfToText(steps){
  animSteps(steps,500);
  const ab=await uploadedFiles[0].arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  let txt='';
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i);
    const c=await pg.getTextContent();
    txt+=c.items.map(it=>it.str).join(' ')+'\n\n';
    updateOverlay(10+80*i/pdf.numPages,'Extraction page '+i+'/'+pdf.numPages+'...');
    await delay(100);
  }
  return{type:'text',text:txt,fileName:uploadedFiles[0].name.replace('.pdf','')+'.txt',info:pdf.numPages+' page(s) extraite(s)'};
}

// 2. Image → PDF (gratuit)
async function cvImageToPdf(steps){
  const{jsPDF}=window.jspdf;
  animSteps(steps,300);
  const doc=new jsPDF();
  for(let i=0;i<uploadedFiles.length;i++){
    if(i>0)doc.addPage();
    const url=await readAsUrl(uploadedFiles[i]);
    const img=await loadImg(url);
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
    const r=Math.min(pw/img.width,ph/img.height,1);
    doc.addImage(url,'JPEG',(pw-img.width*r)/2,(ph-img.height*r)/2,img.width*r,img.height*r);
    updateOverlay(20+70*i/uploadedFiles.length,'Image '+(i+1)+'/'+uploadedFiles.length);
    await delay(150);
  }
  return{type:'blob',blob:doc.output('blob'),fileName:'images-vers-pdf.pdf',info:uploadedFiles.length+' image(s)'};
}

// 3. Texte → PDF (gratuit)
async function cvTextToPdf(steps){
  const{jsPDF}=window.jspdf;
  animSteps(steps,400);
  const txt=document.getElementById('textInput').value;
  const doc=new jsPDF(); doc.setFont('helvetica'); doc.setFontSize(12);
  const lines=doc.splitTextToSize(txt,170);
  const ph=doc.internal.pageSize.getHeight()-40;
  let y=20,i=0;
  while(i<lines.length){if(y+7>ph+20){doc.addPage();y=20;}doc.text(lines[i],20,y);y+=7;i++;}
  return{type:'blob',blob:doc.output('blob'),fileName:'texte-vers-pdf.pdf',info:lines.length+' ligne(s)'};
}

// 4. PDF → Image (pro)
async function cvPdfToImage(steps){
  animSteps(steps,400);
  const ab=await uploadedFiles[0].arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  const imgs=[];
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i);
    const{canvas}=await renderPageToCanvas(pg,2);
    imgs.push(canvas.toDataURL('image/png'));
    updateOverlay(10+85*i/pdf.numPages,'Rendu page '+i+'/'+pdf.numPages);
    await delay(150);
  }
  return{type:'images',images:imgs,fileName:uploadedFiles[0].name.replace('.pdf',''),info:imgs.length+' image(s)'};
}

// 5. PDF → Word (pro)
async function cvPdfToWord(steps){
  animSteps(steps,500);
  const ab=await uploadedFiles[0].arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  let html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Calibri,sans-serif;font-size:12pt;line-height:1.6;}p{margin:0 0 10px 0;}</style></head><body>';
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i);
    const c=await pg.getTextContent();
    html+='<p style="page-break-after:always;"><strong>--- Page '+i+' ---</strong></p>';
    c.items.forEach(it=>{html+='<p>'+it.str+'</p>';});
    updateOverlay(10+85*i/pdf.numPages,'Extraction page '+i);
    await delay(100);
  }
  html+='</body></html>';
  const blob=new Blob([html],{type:'application/msword'});
  return{type:'blob',blob:blob,fileName:uploadedFiles[0].name.replace('.pdf','')+'.doc',info:pdf.numPages+' page(s) convertie(s)'};
}

// 6. PDF → Excel/CSV (pro)
async function cvPdfToExcel(steps){
  animSteps(steps,500);
  const ab=await uploadedFiles[0].arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  let csv='';
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i);
    const c=await pg.getTextContent();
    let lastY=null;
    c.items.forEach(it=>{
      const y=Math.round(it.transform[5]);
      if(lastY!==null&&Math.abs(y-lastY)>5)csv+='\n';
      else if(lastY!==null)csv+=',';
      csv+='"'+it.str.replace(/"/g,'""')+'"';
      lastY=y;
    });
    csv+='\n\n';
    updateOverlay(10+85*i/pdf.numPages,'Page '+i+'/'+pdf.numPages);
    await delay(100);
  }
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  return{type:'blob',blob:blob,fileName:uploadedFiles[0].name.replace('.pdf','')+'.csv',info:pdf.numPages+' page(s) exportee(s)'};
}

// 7. Fusionner PDF (pro)
async function cvMergePdf(steps){
  const{jsPDF}=window.jspdf;
  animSteps(steps,300);
  const allPages=[];
  for(const f of uploadedFiles){
    const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;
    for(let p=1;p<=pdf.numPages;p++){
      const pg=await pdf.getPage(p);
      const{canvas,w,h}=await renderPageToCanvas(pg,1.5);
      allPages.push({img:canvas.toDataURL('image/jpeg',.9),w,h});
    }
  }
  updateOverlay(60,'Fusion...');
  await delay(300);
  const doc=new jsPDF();
  allPages.forEach((pg,idx)=>{
    if(idx>0)doc.addPage();
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
    const r=Math.min(pw/pg.w,ph/pg.h);
    doc.addImage(pg.img,'JPEG',(pw-pg.w*r)/2,(ph-pg.h*r)/2,pg.w*r,pg.h*r);
  });
  return{type:'blob',blob:doc.output('blob'),fileName:'pdf-fusionne.pdf',info:allPages.length+' page(s) depuis '+uploadedFiles.length+' fichier(s)'};
}

// 8. HTML → PDF (pro)
async function cvHtmlToPdf(steps){
  const{jsPDF}=window.jspdf;
  animSteps(steps,400);
  const html=document.getElementById('textInput').value;
  const doc2=new DOMParser().parseFromString(html,'text/html');
  const txt=doc2.body?doc2.body.textContent:html;
  const doc=new jsPDF(); doc.setFont('helvetica'); doc.setFontSize(11);
  const lines=doc.splitTextToSize(txt,170);
  const ph=doc.internal.pageSize.getHeight()-40;
  let y=20,i=0;
  while(i<lines.length){if(y+6>ph+20){doc.addPage();y=20;}doc.text(lines[i],20,y);y+=6;i++;}
  return{type:'blob',blob:doc.output('blob'),fileName:'html-vers-pdf.pdf',info:lines.length+' ligne(s)'};
}

// 9. Diviser PDF (pro)
async function cvSplitPdf(steps){
  const{jsPDF}=window.jspdf;
  animSteps(steps,400);
  const rangeStr=document.getElementById('pageRangeInput').value.trim()||'1';
  const pages=parsePageRange(rangeStr);
  const ab=await uploadedFiles[0].arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  const doc=new jsPDF();
  let added=false;
  for(const p of pages){
    if(p<1||p>pdf.numPages)continue;
    if(added)doc.addPage();
    const pg=await pdf.getPage(p);
    const{canvas,w,h}=await renderPageToCanvas(pg,1.5);
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
    const r=Math.min(pw/w,ph/h);
    doc.addImage(canvas.toDataURL('image/jpeg',.9),'JPEG',(pw-w*r)/2,(ph-h*r)/2,w*r,h*r);
    added=true;
    updateOverlay(20+70*pages.indexOf(p)/pages.length,'Page '+p);
    await delay(100);
  }
  return{type:'blob',blob:doc.output('blob'),fileName:'pdf-extrait.pdf',info:pages.length+' page(s) extraite(s)'};
}

// 10. Pivoter PDF (pro)
async function cvRotatePdf(steps){
  const{jsPDF}=window.jspdf;
  animSteps(steps,400);
  const ab=await uploadedFiles[0].arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  const doc=new jsPDF({orientation:'landscape'});
  for(let i=1;i<=pdf.numPages;i++){
    if(i>1)doc.addPage();
    const pg=await pdf.getPage(i);
    const{canvas,w,h}=await renderPageToCanvas(pg,1.5);
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
    const r=Math.min(pw/h,ph/w);
    doc.addImage(canvas.toDataURL('image/jpeg',.9),'JPEG',(pw-h*r)/2,(ph-w*r)/2,h*r,w*r);
    updateOverlay(10+85*i/pdf.numPages,'Rotation page '+i);
    await delay(100);
  }
  return{type:'blob',blob:doc.output('blob'),fileName:'pdf-pivote.pdf',info:pdf.numPages+' page(s) pivotee(s) de 90°'};
}

// 11. Filigrane PDF (pro)
async function cvWatermarkPdf(steps){
  const{jsPDF}=window.jspdf;
  animSteps(steps,400);
  const wmText=document.getElementById('watermarkInput').value||'CONFIDENTIEL';
  const ab=await uploadedFiles[0].arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  const doc=new jsPDF();
  for(let i=1;i<=pdf.numPages;i++){
    if(i>1)doc.addPage();
    const pg=await pdf.getPage(i);
    const{canvas,w,h}=await renderPageToCanvas(pg,1.5);
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
    const r=Math.min(pw/w,ph/h);
    const iw=w*r,ih=h*r;
    doc.addImage(canvas.toDataURL('image/jpeg',.9),'JPEG',(pw-iw)/2,(ph-ih)/2,iw,ih);
    // Filigrane diagonal
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({opacity:0.15}));
    doc.setFontSize(50);
    doc.setTextColor(200,0,0);
    const angle=Math.atan2(ph,pw);
    doc.text(wmText,pw/2,ph/2,{angle:angle,align:'center'});
    doc.restoreGraphicsState();
    updateOverlay(10+85*i/pdf.numPages,'Filigrane page '+i);
    await delay(100);
  }
  return{type:'blob',blob:doc.output('blob'),fileName:'pdf-filigrane.pdf',info:pdf.numPages+' page(s) avec filigrane "'+wmText+'"'};
}

// 12. Compresser PDF (pro)
async function cvCompressPdf(steps){
  const{jsPDF}=window.jspdf;
  animSteps(steps,400);
  const ab=await uploadedFiles[0].arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:ab}).promise;
  const doc=new jsPDF();
  const origSize=uploadedFiles[0].size;
  for(let i=1;i<=pdf.numPages;i++){
    if(i>1)doc.addPage();
    const pg=await pdf.getPage(i);
    // Rendu a echelle reduite pour compression
    const{canvas,w,h}=await renderPageToCanvas(pg,1);
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
    const r=Math.min(pw/w,ph/h);
    doc.addImage(canvas.toDataURL('image/jpeg',.6),'JPEG',(pw-w*r)/2,(ph-h*r)/2,w*r,h*r);
    updateOverlay(10+85*i/pdf.numPages,'Compression page '+i);
    await delay(100);
  }
  const compressed=doc.output('blob');
  const reduction=Math.round((1-compressed.size/origSize)*100);
  return{type:'blob',blob:compressed,fileName:'pdf-compresse.pdf',info:pdf.numPages+' page(s), reduction ~'+reduction+'%'};
}

function parsePageRange(str){
  const pages=new Set();
  str.split(',').forEach(part=>{
    part=part.trim();
    if(part.includes('-')){
      const[a,b]=part.split('-').map(Number);
      for(let i=a;i<=b;i++)pages.add(i);
    } else {
      const n=parseInt(part);
      if(!isNaN(n))pages.add(n);
    }
  });
  return Array.from(pages).sort((a,b)=>a-b);
}

// ===== AFFICHER RESULTAT =====
function showResult(r){
  document.getElementById('resultArea').style.display='block';
  document.getElementById('resultInfo').textContent=r.info;
  const tr=document.getElementById('textResult'), btn=document.getElementById('downloadBtn');
  if(r.type==='text'){
    tr.style.display='block';
    document.getElementById('extractedText').textContent=r.text.substring(0,5000)+(r.text.length>5000?'\n\n... (tronque)':'');
    btn.innerHTML='<i class="fas fa-download"></i> Telecharger le fichier texte';
  } else if(r.type==='images'){
    tr.style.display='block';
    const c=document.getElementById('extractedText'); c.textContent='';
    const w=document.createElement('div'); w.style.cssText='display:flex;flex-wrap:wrap;gap:10px;';
    r.images.forEach((img,i)=>{const d=document.createElement('div');d.style.textAlign='center';d.innerHTML='<img src="'+img+'" style="max-width:180px;border-radius:8px;border:1px solid #E5E7EB;"><p style="font-size:11px;color:#8A8F98;margin-top:4px;">Page '+(i+1)+'</p>';w.appendChild(d);});
    c.appendChild(w);
    btn.innerHTML='<i class="fas fa-download"></i> Telecharger les images';
  } else {
    tr.style.display='none';
    btn.innerHTML='<i class="fas fa-download"></i> Telecharger le PDF';
  }
  document.getElementById('convertBtn').disabled=false;
  toast('Conversion terminee !','success');
}

function downloadResult(){
  if(!conversionResult)return;
  const r=conversionResult;
  if(r.type==='text') dlBlob(new Blob([r.text],{type:'text/plain;charset=utf-8'}),r.fileName);
  else if(r.type==='images') r.images.forEach((img,i)=>{const a=document.createElement('a');a.href=img;a.download=r.fileName+'_page_'+(i+1)+'.png';a.click();});
  else dlBlob(r.blob,r.fileName);
}
function dlBlob(blob,name){const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);}

// ===== DASHBOARD =====
function refreshDashboard(){
  const user=getUser(); if(!user)return; refreshCycle(user);
  document.getElementById('dashUsername').textContent=user.name;
  document.getElementById('dashUsed').textContent=user.isPro?'Illimite':(user.cycleUsed||0);
  document.getElementById('dashLimit').textContent=user.isPro?'':'sur '+FREE_LIMIT;
  document.getElementById('dashTotal').textContent=user.totalConversions||0;
  const badge=document.getElementById('dashBadge'), upBtn=document.getElementById('dashUpgradeBtn');
  if(user.isPro){badge.className='badge-pro';badge.innerHTML='<i class="fas fa-crown"></i> Pro';upBtn.style.display='none';}
  else{badge.className='badge-free';badge.textContent='Gratuit';upBtn.style.display='inline-flex';}
  const circ=2*Math.PI*34;
  if(!user.isPro){const rem=getTimeLeft(user),frac=rem/CYCLE_MS;const tc=document.getElementById('timerCircle');tc.style.strokeDasharray=circ;tc.style.strokeDashoffset=circ*(1-frac);tc.style.stroke='#0A7CFF';document.getElementById('timerText').textContent=fmtTime(rem);}
  else{document.getElementById('timerCircle').style.strokeDashoffset=0;document.getElementById('timerCircle').style.stroke='#059669';document.getElementById('timerText').textContent='--';}
  const list=document.getElementById('historyList');
  if(!user.history||!user.history.length){list.innerHTML='<div class="table-empty"><i class="fas fa-inbox"></i><p>Aucune conversion</p></div>';}
  else{const names={'pdf-to-text':'PDF→Texte','pdf-to-image':'PDF→Image','image-to-pdf':'Image→PDF','text-to-pdf':'Texte→PDF','pdf-to-word':'PDF→Word','pdf-to-excel':'PDF→Excel','merge-pdf':'Fusion','html-to-pdf':'HTML→PDF','split-pdf':'Split','rotate-pdf':'Rotation','watermark-pdf':'Filigrane','compress-pdf':'Compression'};
  list.innerHTML=user.history.slice(0,20).map(h=>'<div class="table-row"><span style="display:flex;align-items:center;gap:6px;"><i class="fas fa-file" style="color:#8A8F98;font-size:12px;"></i> '+h.fileName+'</span><span style="color:#0A7CFF;font-size:13px;">'+(names[h.tool]||h.tool)+'</span><span style="color:#8A8F98;font-size:13px;">'+new Date(h.date).toLocaleDateString('fr-FR')+'</span><span style="color:#059669;font-size:13px;"><i class="fas fa-check-circle"></i></span></div>').join('');}
}
function clearHistory(){const u=getUser();if(!u)return;u.history=[];saveUser(u);refreshDashboard();toast('Historique efface','info');}

// ===== STRIPE =====
function processStripeCheckout(){
  const user=getUser();
  if(!user){openModal('login');return;}
  if(user.isPro){toast('Deja Pro','info');return;}
  if(STRIPE_PUBLIC_KEY==='VOTRE_CLE_PUBLIQUE_STRIPE'){
    const btn=document.getElementById('stripeCheckoutBtn');btn.disabled=true;btn.innerHTML='<i class="fas fa-exclamation-triangle"></i> Non configure';
    const h=document.getElementById('stripeHelp');h.style.display='block';
    h.innerHTML='<strong>Configuration requise :</strong><br>1. Creez un compte sur <a href="https://dashboard.stripe.com/register" target="_blank">stripe.com</a><br>2. Liez votre compte bancaire<br>3. Creez un produit a 0.99 EUR/mois<br>4. Copiez pk_... et price_... dans script.js';
    return;
  }
  const btn=document.getElementById('stripeCheckoutBtn');btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Ouverture...';
  try{
    if(!stripeInstance)stripeInstance=Stripe(STRIPE_PUBLIC_KEY);
    stripeInstance.redirectToCheckout({lineItems:[{price:STRIPE_PRICE_ID,quantity:1}],mode:'subscription',successUrl:location.origin+location.pathname+'?upgrade=success&uid='+user.id,cancelUrl:location.origin+location.pathname+'?upgrade=cancel',customerEmail:user.email,locale:'fr'})
    .then(r=>{if(r.error){toast(r.error.message,'error');btn.disabled=false;btn.innerHTML='<i class="fas fa-credit-card"></i> Payer avec Stripe';}});
  }catch(e){toast('Erreur : '+e.message,'error');btn.disabled=false;btn.innerHTML='<i class="fas fa-credit-card"></i> Payer avec Stripe';}
}
function checkStripeReturn(){
  const p=new URLSearchParams(location.search);
  const uid=p.get('uid'),s=p.get('upgrade');
  if(s==='success'&&uid){const us=getUsers(),u=us[uid];if(u){u.isPro=true;saveUser(u);currentUser=u;updateNav();toast('Paiement accepte ! Bienvenue Pro','success');}history.replaceState({},'',location.pathname);}
  else if(s==='cancel'){toast('Paiement annule','info');history.replaceState({},'',location.pathname);}
}

// ===== PLANS =====
function handleFreePlan(){const u=getUser();if(!u){openModal('register');}else{navigate('tools');}}
function handleProPlan(){const u=getUser();if(!u){openModal('register');toast('Creez un compte','info');return;}if(u.isPro){toast('Deja Pro','info');return;}openModal('subscribe');}

// ===== COMPTEUR ANIME =====
function animCounter(id,target,dur=1800){const el=document.getElementById(id);if(!el)return;let start=null;function step(ts){if(!start)start=ts;const p=Math.min((ts-start)/dur,1);el.textContent=Math.round((1-Math.pow(1-p,3))*target).toLocaleString('fr-FR');if(p<1)requestAnimationFrame(step);}requestAnimationFrame(step);}

// ===== TIMER RENOUVELLEMENT =====
setInterval(()=>{
  const user=getUser();if(!user||user.isPro)return;
  const rem=getTimeLeft(user),circ=2*Math.PI*34;
  const tc=document.getElementById('timerCircle'),tt=document.getElementById('timerText');
  if(tc&&tt){tc.style.strokeDasharray=circ;tc.style.strokeDashoffset=circ*(1-rem/CYCLE_MS);tt.textContent=fmtTime(rem);}
  if(rem===0&&user.cycleUsed>0){refreshCycle(user);updateLimitUI();if(document.getElementById('page-dashboard').classList.contains('page-visible'))refreshDashboard();toast('Quota renouvele !','success');}
},1000);

// ===== INPUT TEXTE → BOUTON =====
document.getElementById('textInput').addEventListener('input',function(){if(TOOLS[currentTool].hasText)document.getElementById('convertBtn').disabled=!this.value.trim();});

// ===== HEADER SCROLL =====
window.addEventListener('scroll',()=>{document.getElementById('header').classList.toggle('header-scrolled',window.scrollY>20);});

// ===== INIT =====
document.addEventListener('DOMContentLoaded',()=>{
  currentUser=getUser();
  updateNav();
  buildToolsGrid();
  checkStripeReturn();
  const total=Object.values(getUsers()).reduce((s,u)=>s+(u.totalConversions||0),0);
  animCounter('statConversions',Math.max(total,1247));
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
