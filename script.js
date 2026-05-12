/* ================================================================
   PDFShift — Logique complete
   ================================================================ */

// ===== STRIPE =====
const STRIPE_PK = 'VOTRE_CLE_PUBLIQUE_STRIPE';
const STRIPE_PRICES = { pro: 'VOTRE_ID_PRIX_PRO', biz: 'VOTRE_ID_PRIX_BIZ', ent: 'VOTRE_ID_PRIX_ENT' };
let stripeInstance = null;
let selectedPlan = 'pro';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const FREE_LIMIT = 3, CYCLE_MS = 48*3600*1000;
let currentUser = null, currentTool = 'pdf-to-text', uploadedFiles = [], conversionResult = null, captchaVerified = false, pendingUser = null;

const TOOLS = {
  'pdf-to-text':   {title:'PDF vers Texte',    desc:'Extrayez le texte',           icon:'fa-file-alt',    color:'#2B7BF5',bg:'#EEF4FF',accept:'.pdf',             multiple:false,hasText:false,pro:false,outIcon:'fa-file-alt',outLabel:'TXT'},
  'image-to-pdf':  {title:'Image vers PDF',    desc:'Images en document',          icon:'fa-file-image',  color:'#10B981',bg:'#ECFDF5',accept:'.jpg,.jpeg,.png',  multiple:true, hasText:false,pro:false,outIcon:'fa-file-pdf',outLabel:'PDF'},
  'text-to-pdf':   {title:'Texte vers PDF',    desc:'Texte en document',           icon:'fa-pen-nib',     color:'#F59E0B',bg:'#FFFBEB',accept:null,               multiple:false,hasText:true, pro:false,outIcon:'fa-file-pdf',outLabel:'PDF'},
  'pdf-to-image':  {title:'PDF vers Image',    desc:'Pages en images PNG',         icon:'fa-image',       color:'#0EA5E9',bg:'#E0F2FE',accept:'.pdf',             multiple:false,hasText:false,pro:true, outIcon:'fa-image',outLabel:'PNG'},
  'pdf-to-word':   {title:'PDF vers Word',     desc:'Export Word editable',        icon:'fa-file-word',   color:'#2563EB',bg:'#DBEAFE',accept:'.pdf',             multiple:false,hasText:false,pro:true, outIcon:'fa-file-word',outLabel:'DOC'},
  'pdf-to-excel':  {title:'PDF vers Excel',    desc:'Donnees en tableur',          icon:'fa-file-excel',  color:'#16A34A',bg:'#DCFCE7',accept:'.pdf',             multiple:false,hasText:false,pro:true, outIcon:'fa-file-excel',outLabel:'CSV'},
  'merge-pdf':     {title:'Fusionner PDF',     desc:'Combinez plusieurs PDF',       icon:'fa-layer-group', color:'#EF4444',bg:'#FEF2F2',accept:'.pdf',             multiple:true, hasText:false,pro:true, outIcon:'fa-file-pdf',outLabel:'PDF'},
  'html-to-pdf':   {title:'HTML vers PDF',     desc:'Code HTML en document',       icon:'fa-code',        color:'#7C3AED',bg:'#F3E8FF',accept:null,               multiple:false,hasText:true, pro:true, outIcon:'fa-file-pdf',outLabel:'PDF'},
  'split-pdf':     {title:'Diviser PDF',       desc:'Extraire des pages',          icon:'fa-cut',         color:'#E11D48',bg:'#FFE4E6',accept:'.pdf',             multiple:false,hasText:false,pro:true, outIcon:'fa-file-pdf',outLabel:'PDF'},
  'rotate-pdf':    {title:'Pivoter PDF',       desc:'Tourner les pages',            icon:'fa-redo',        color:'#0891B2',bg:'#CFFAFE',accept:'.pdf',             multiple:false,hasText:false,pro:true, outIcon:'fa-file-pdf',outLabel:'PDF'},
  'watermark-pdf': {title:'Filigrane PDF',     desc:'Ajoutez un filigrane',         icon:'fa-stamp',       color:'#CA8A04',bg:'#FEF9C3',accept:'.pdf',             multiple:false,hasText:false,pro:true, outIcon:'fa-file-pdf',outLabel:'PDF'},
  'compress-pdf':  {title:'Compresser PDF',    desc:'Reduisez la taille',           icon:'fa-compress-alt',color:'#64748B',bg:'#F1F5F9',accept:'.pdf',             multiple:false,hasText:false,pro:true, outIcon:'fa-file-pdf',outLabel:'PDF'}
};

// ===== STOCKAGE =====
function getUsers(){return JSON.parse(localStorage.getItem('pdfshift_users')||'{}')}
function saveUsers(u){localStorage.setItem('pdfshift_users',JSON.stringify(u))}
function getUser(){const id=localStorage.getItem('pdfshift_session');if(!id)return null;return getUsers()[id]||null}
function saveUser(u){const us=getUsers();us[u.id]=u;saveUsers(us);currentUser=u}

// ===== LIMITES =====
function refreshCycle(u){const n=Date.now();if(!u.cycleStart){u.cycleStart=n;u.cycleUsed=0;saveUser(u);return}if(n-u.cycleStart>=CYCLE_MS){u.cycleStart=n;u.cycleUsed=0;saveUser(u)}}
function getRemaining(u){if(u.isPro)return Infinity;refreshCycle(u);return Math.max(0,FREE_LIMIT-(u.cycleUsed||0))}
function consume(u){if(u.isPro){u.totalConversions=(u.totalConversions||0)+1;saveUser(u);return true}if(getRemaining(u)<=0)return false;u.cycleUsed=(u.cycleUsed||0)+1;u.totalConversions=(u.totalConversions||0)+1;saveUser(u);return true}
function getTimeLeft(u){refreshCycle(u);return Math.max(0,CYCLE_MS-(Date.now()-u.cycleStart))}
function fmtTime(ms){const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return h>0?h+'h '+String(m).padStart(2,'0')+'min':m+'min '+String(sec).padStart(2,'0')+'s'}
function fmtSize(b){if(b<1024)return b+' o';if(b<1048576)return(b/1024).toFixed(1)+' Ko';return(b/1048576).toFixed(2)+' Mo'}

// ===== NAVIGATION =====
function navigate(page){
  if(page==='dashboard'&&!getUser()){openModal('login');toast('Connectez-vous','info');return}
  const cur=document.querySelector('.page-visible'),next=document.getElementById('page-'+page);
  if(!next||cur===next)return;
  cur.style.opacity='0';cur.style.transform='translateY(8px)';
  setTimeout(()=>{cur.classList.replace('page-visible','page-hidden');cur.style.opacity='';cur.style.transform='';
    next.classList.replace('page-hidden','page-visible');next.style.opacity='0';next.style.transform='translateY(8px)';
    requestAnimationFrame(()=>{next.style.opacity='1';next.style.transform='translateY(0)'});},180);
  document.querySelectorAll('.nav-link[data-page]').forEach(l=>l.classList.remove('active'));
  document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add('active');
  closeDropdown();window.scrollTo({top:0,behavior:'smooth'});
  if(page==='dashboard')refreshDashboard();
  if(page==='pricing')buildPricing();
}

// ===== DROPDOWN =====
function toggleDropdown(){document.getElementById('dropdownMenu').classList.toggle('open')}
function closeDropdown(){document.getElementById('dropdownMenu').classList.remove('open')}
document.addEventListener('click',e=>{if(!e.target.closest('.nav-dropdown'))closeDropdown()});

// ===== TOAST =====
function toast(msg,type='info'){
  const c=document.getElementById('toastContainer'),icons={success:'fa-check-circle',error:'fa-exclamation-circle',warning:'fa-exclamation-triangle',info:'fa-info-circle'};
  const t=document.createElement('div');t.className='toast toast-'+type;t.innerHTML='<i class="fas '+icons[type]+'"></i> '+msg;
  c.appendChild(t);setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(-8px)';t.style.transition='all .3s';setTimeout(()=>t.remove(),300)},4000);
}

// ===== MODALS =====
function openModal(id){document.getElementById('modalOverlay').style.display='flex';document.querySelectorAll('.modal').forEach(m=>m.style.display='none');document.getElementById('modal-'+id).style.display='block';document.body.style.overflow='hidden'}
function closeModal(){document.getElementById('modalOverlay').style.display='none';document.body.style.overflow=''}
function switchModal(id){document.querySelectorAll('.modal').forEach(m=>m.style.display='none');document.getElementById('modal-'+id).style.display='block'}

// ===== CAPTCHA =====
function verifyCaptcha(){
  if(captchaVerified)return;
  // Simuler un delai de verification
  const box=document.getElementById('captchaBox');
  box.innerHTML='<i class="fas fa-spinner fa-spin"></i> Verification...';
  box.style.pointerEvents='none';
  setTimeout(()=>{
    captchaVerified=true;
    box.style.display='none';
    document.getElementById('captchaCheck').style.display='flex';
    document.getElementById('regSubmitBtn').disabled=false;
  },1200);
}

// ===== EMAIL VERIFICATION =====
function verifyCodeInput(el,nextId){
  el.value=el.value.replace(/\D/g,'');
  if(el.value&&nextId)document.getElementById(nextId).focus();
}
function processVerification(){
  const code=[1,2,3,4,5,6].map(i=>document.getElementById('verifyCode'+i).value).join('');
  if(code.length!==6){toast('Entrez le code complet','warning');return}
  if(code!=='123456'){toast('Code incorrect. Essayez 123456','error');return}
  // Creer le compte
  if(!pendingUser)return;
  const users=getUsers();
  pendingUser.id='u_'+Date.now();
  pendingUser.cycleStart=Date.now();pendingUser.cycleUsed=0;pendingUser.totalConversions=0;pendingUser.history=[];pendingUser.createdAt=Date.now();
  users[pendingUser.id]=pendingUser;saveUsers(users);
  localStorage.setItem('pdfshift_session',pendingUser.id);
  currentUser=pendingUser;pendingUser=null;
  closeModal();updateNav();toast('Compte cree avec succes !','success');
}
function resendCode(){toast('Code renvoye (demo : 123456)','info');document.getElementById('resendBtn').disabled=true;setTimeout(()=>document.getElementById('resendBtn').disabled=false,30000)}

// ===== AUTH =====
function handleRegister(e){
  e.preventDefault();
  if(!captchaVerified){toast('Verifiez que vous n\'etes pas un robot','warning');return}
  const name=document.getElementById('regName').value.trim();
  const email=document.getElementById('regEmail').value.trim().toLowerCase();
  const pw=document.getElementById('regPassword').value;
  const pw2=document.getElementById('regPasswordConfirm').value;
  if(pw!==pw2){toast('Mots de passe differents','error');return}
  const users=getUsers();
  if(Object.values(users).find(u=>u.email===email)){toast('E-mail deja utilise','error');return}
  pendingUser={name,email,password:btoa(pw),isPro:false};
  // Passer a la verification email
  document.getElementById('verifyEmail').textContent=email;
  [1,2,3,4,5,6].forEach(i=>document.getElementById('verifyCode'+i).value='');
  switchModal('verify');
  document.getElementById('verifyCode1').focus();
  toast('Code envoye ! (demo : 123456)','info');
}
function handleLogin(e){
  e.preventDefault();
  const email=document.getElementById('loginEmail').value.trim().toLowerCase();
  const pw=document.getElementById('loginPassword').value;
  const user=Object.values(getUsers()).find(u=>u.email===email);
  if(!user||atob(user.password)!==pw){toast('Identifiants incorrects','error');return}
  localStorage.setItem('pdfshift_session',user.id);currentUser=user;closeModal();updateNav();toast('Bon retour, '+user.name+' !','success');
}
function socialLogin(provider){
  // Simuler connexion sociale
  const fakeEmail='user_'+provider+'@exemple.com';
  let user=Object.values(getUsers()).find(u=>u.email===fakeEmail);
  if(!user){
    user={id:'u_'+Date.now(),name:provider.charAt(0).toUpperCase()+provider.slice(1)+' User',email:fakeEmail,password:btoa('social_'+Date.now()),isPro:false,cycleStart:Date.now(),cycleUsed:0,totalConversions:0,history:[],createdAt:Date.now()};
    const users=getUsers();users[user.id]=user;saveUsers(users);
  }
  localStorage.setItem('pdfshift_session',user.id);currentUser=user;closeModal();updateNav();toast('Connecte avec '+provider,'success');
}
function logout(){localStorage.removeItem('pdfshift_session');currentUser=null;updateNav();navigate('home');toast('Deconnecte','info')}
function togglePassword(id,btn){const inp=document.getElementById(id);const ic=btn.querySelector('i');if(inp.type==='password'){inp.type='text';ic.className='fas fa-eye-slash'}else{inp.type='password';ic.className='fas fa-eye'}}
function checkPasswordStrength(pw){
  const bars=document.querySelectorAll('#strengthBars>div'),txt=document.getElementById('strengthText');
  let s=0;if(pw.length>=6)s++;if(pw.length>=10)s++;if(/[A-Z]/.test(pw)&&/[a-z]/.test(pw))s++;if(/[0-9]/.test(pw)&&/[^A-Za-z0-9]/.test(pw))s++;
  const c=['#E2E8F0','#EF4444','#F59E0B','#2B7BF5','#10B981'],l=['','Faible','Moyen','Bon','Excellent'];
  bars.forEach((b,i)=>b.style.background=i<s?c[s]:'#E2E8F0');txt.textContent=pw.length>0?l[s]:'';txt.style.color=c[s];
}

// ===== NAV UPDATE =====
function updateNav(){
  const user=getUser(),auth=document.getElementById('navAuth'),dash=document.getElementById('navDashboard');
  if(user){
    dash.style.display='inline-flex';
    auth.innerHTML=`<div style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;background:rgba(255,255,255,.1);border-radius:6px;display:flex;align-items:center;justify-content:center"><i class="fas fa-user" style="color:rgba(255,255,255,.7);font-size:11px"></i></div><span style="font-size:13px;font-weight:500;color:rgba(255,255,255,.8)">${user.name}</span>${user.isPro?'<span style="background:rgba(43,123,245,.3);color:#93BBFD;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px">PRO</span>':''}</div><button class="btn-ghost" onclick="logout()" style="color:rgba(255,255,255,.5)"><i class="fas fa-sign-out-alt"></i></button>`;
  }else{dash.style.display='none';auth.innerHTML='<button class="btn-ghost" onclick="openModal(\'login\')">Se connecter</button><button class="btn-nav-cta" onclick="openModal(\'register\')">Essai gratuit</button>'}
}

// ===== BUILD TOOLS GRID =====
function buildToolsGrid(){
  const grid=document.getElementById('toolsGrid');grid.innerHTML='';let i=0;
  for(const[id,t]of Object.entries(TOOLS)){
    const card=document.createElement('div');card.className='tool-card anim-up';card.style.animationDelay=(i*0.05)+'s';
    card.onclick=()=>selectTool(id);
    card.innerHTML=`<div style="position:absolute;top:0;left:0;right:0;height:3px;background:${t.color};transform:scaleX(0);transition:transform .3s;transform-origin:left"></div>
      <div class="tc-icon" style="background:${t.bg};color:${t.color}"><i class="fas ${t.icon}"></i></div>
      <div class="tc-name">${t.title}</div><div class="tc-desc">${t.desc}</div>
      ${t.pro?'<div class="tc-lock"><i class="fas fa-lock"></i> Pro</div>':''}`;
    card.onmouseenter=function(){this.querySelector('div').style.transform='scaleX(1)'};
    card.onmouseleave=function(){this.querySelector('div').style.transform='scaleX(0)'};
    grid.appendChild(card);i++;
  }
}

// ===== SELECT TOOL =====
function selectTool(id){
  const t=TOOLS[id];
  if(t.pro){const u=getUser();if(!u){openModal('login');toast('Connectez-vous','warning');return}if(!u.isPro){openModal('pro-lock');return}}
  currentTool=id;
  document.getElementById('toolTitle').textContent=t.title;document.getElementById('toolDesc').textContent=t.desc;
  const ic=document.getElementById('toolIcon');ic.innerHTML='<i class="fas '+t.icon+'"></i>';ic.style.background=t.bg;ic.style.color=t.color;
  document.getElementById('toolProBadge').style.display=t.pro?'inline-flex':'none';
  const fi=document.getElementById('fileInput');
  if(t.accept){fi.accept=t.accept;fi.multiple=t.multiple;document.getElementById('acceptedFormats').textContent=t.accept.toUpperCase().replace(/\./g,'').replace(/,/g,', ');document.getElementById('dropZone').style.display='block'}
  else document.getElementById('dropZone').style.display='none';
  document.getElementById('textInputArea').style.display=t.hasText?'block':'none';
  document.getElementById('textInput').value='';document.getElementById('textInput').placeholder=id==='text-to-pdf'?'Collez votre texte ici...':'Collez votre code HTML ici...';
  document.getElementById('pageRangeArea').style.display=id==='split-pdf'?'block':'none';
  document.getElementById('watermarkArea').style.display=id==='watermark-pdf'?'block':'none';
  uploadedFiles=[];conversionResult=null;resetToolUI();updateLimitUI();navigate('tools');
}
function resetToolUI(){document.getElementById('dropContent').style.display='block';document.getElementById('filePreview').style.display='none';document.getElementById('convertBtn').disabled=true;document.getElementById('resultArea').style.display='none';document.getElementById('textResult').style.display='none'}
function clearFile(){uploadedFiles=[];document.getElementById('fileInput').value='';resetToolUI()}
function updateLimitUI(){const u=getUser(),b=document.getElementById('limitBanner');if(u&&u.isPro){b.style.display='none';return}b.style.display='flex';const rem=u?getRemaining(u):FREE_LIMIT;document.getElementById('limitText').textContent=rem+' restante'+(rem!==1?'s':'');const f=document.getElementById('limitProgress');f.style.width=(rem/FREE_LIMIT*100)+'%';f.style.background=rem===0?'#EF4444':'#F59E0B'}

// ===== UPLOAD =====
const dropZone=document.getElementById('dropZone'),fileInput=document.getElementById('fileInput');
dropZone.addEventListener('dragover',e=>{e.preventDefault();dropZone.classList.add('drag-over')});
dropZone.addEventListener('dragleave',()=>dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop',e=>{e.preventDefault();dropZone.classList.remove('drag-over');handleFiles(e.dataTransfer.files)});
fileInput.addEventListener('change',e=>handleFiles(e.target.files));
function handleFiles(files){
  if(!files||!files.length)return;const u=getUser();if(!u){toast('Connectez-vous','warning');openModal('login');return}
  const t=TOOLS[currentTool];uploadedFiles=Array.from(files);
  for(const f of uploadedFiles){const ext='.'+f.name.split('.').pop().toLowerCase();if(t.accept&&!t.accept.includes(ext)){toast('Format non supporte','error');uploadedFiles=[];return}const mx=u.isPro?52428800:5242880;if(f.size>mx){toast('Fichier trop volumineux (max '+(u.isPro?'50':'5')+' Mo)','error');uploadedFiles=[];return}}
  document.getElementById('dropContent').style.display='none';const prev=document.getElementById('filePreview');prev.style.display='flex';
  prev.querySelector('i').className='fas fa-file-pdf';document.getElementById('fileName').textContent=uploadedFiles.length===1?uploadedFiles[0].name:uploadedFiles.length+' fichiers';document.getElementById('fileSize').textContent=uploadedFiles.length===1?fmtSize(uploadedFiles[0].size):uploadedFiles.map(f=>fmtSize(f.size)).join(', ');
  document.getElementById('convertBtn').disabled=false;updateLimitUI();
}

// ===== OVERLAY =====
function showOverlay(inI,inL,outI,outL){
  document.getElementById('cvFmtIn').innerHTML='<i class="fas '+inI+'"></i><span>'+inL+'</span>';
  document.getElementById('cvFmtOut').innerHTML='<i class="fas '+outI+'"></i><span>'+outL+'</span>';
  ['cvFmtIn','cvFmtOut'].forEach(id=>document.getElementById(id).classList.remove('done'));
  document.getElementById('cvArrowWrap').classList.remove('active');
  document.getElementById('cvRingCircle').style.strokeDashoffset='553';document.getElementById('cvRingCircle').style.stroke='#2B7BF5';
  document.getElementById('cvRingInner').classList.remove('done');document.getElementById('cvSpinIcon').style.display='block';document.getElementById('cvCheckIcon').style.display='none';
  document.getElementById('cvPercentText').textContent='0%';
  const c=document.getElementById('cvParticles');c.innerHTML='';
  for(let i=0;i<16;i++){const p=document.createElement('div');p.className='cv-particle';const a=Math.random()*Math.PI*2,d=80+Math.random()*120;p.style.cssText=`left:${50+Math.cos(a)*d}%;top:${50+Math.sin(a)*d}%;width:${2+Math.random()*4}px;height:${2+Math.random()*4}px;animation-delay:${Math.random()*2}s;animation-duration:${2+Math.random()*2}s`;c.appendChild(p)}
  document.getElementById('cvOverlay').classList.add('active');document.body.style.overflow='hidden';
}
function updateOverlay(pct,step){document.getElementById('cvRingCircle').style.strokeDashoffset=553-553*pct/100;document.getElementById('cvPercentText').textContent=Math.round(pct)+'%';document.getElementById('cvStepText').textContent=step;if(pct>15)document.getElementById('cvArrowWrap').classList.add('active');if(pct>40)document.getElementById('cvFmtIn').classList.add('done');if(pct>85)document.getElementById('cvFmtOut').classList.add('done')}
function completeOverlay(){document.getElementById('cvRingCircle').style.stroke='#10B981';document.getElementById('cvRingCircle').style.strokeDashoffset='0';document.getElementById('cvRingInner').classList.add('done');document.getElementById('cvSpinIcon').style.display='none';document.getElementById('cvCheckIcon').style.display='block';document.getElementById('cvStepText').textContent='Termine !';document.getElementById('cvPercentText').textContent='100%'}
function hideOverlay(){document.getElementById('cvOverlay').classList.remove('active');document.body.style.overflow=''}

// ===== CONVERSION =====
async function startConversion(){
  const u=getUser();if(!u){openModal('login');return}const t=TOOLS[currentTool];
  if(!t.hasText&&!uploadedFiles.length){toast('Selectionnez un fichier','warning');return}
  if(t.hasText&&!document.getElementById('textInput').value.trim()){toast('Saisissez du texte','warning');return}
  if(!consume(u)){toast('Limite atteinte ! Renouvellement dans '+fmtTime(getTimeLeft(u)),'error');updateLimitUI();return}
  document.getElementById('convertBtn').disabled=true;document.getElementById('resultArea').style.display='none';
  showOverlay('fa-file-pdf','PDF',t.outIcon,t.outLabel);
  try{
    let result;
    const steps=[{p:10,t:'Lecture...'},{p:30,t:'Analyse...'},{p:50,t:'Traitement...'},{p:70,t:'Conversion...'},{p:90,t:'Finalisation...'}];
    switch(currentTool){
      case'pdf-to-text':result=await cvPdfToText(steps);break;case'image-to-pdf':result=await cvImageToPdf(steps);break;case'text-to-pdf':result=await cvTextToPdf(steps);break;
      case'pdf-to-image':result=await cvPdfToImage(steps);break;case'pdf-to-word':result=await cvPdfToWord(steps);break;case'pdf-to-excel':result=await cvPdfToExcel(steps);break;
      case'merge-pdf':result=await cvMergePdf(steps);break;case'html-to-pdf':result=await cvHtmlToPdf(steps);break;case'split-pdf':result=await cvSplitPdf(steps);break;
      case'rotate-pdf':result=await cvRotatePdf(steps);break;case'watermark-pdf':result=await cvWatermarkPdf(steps);break;case'compress-pdf':result=await cvCompressPdf(steps);break;
    }
    completeOverlay();await delay(1200);hideOverlay();conversionResult=result;
    u.history.unshift({id:Date.now(),tool:currentTool,fileName:result.fileName,date:Date.now(),status:'ok'});
    if(u.history.length>50)u.history=u.history.slice(0,50);saveUser(u);showResult(result);
  }catch(err){console.error(err);hideOverlay();toast('Erreur : '+err.message,'error');document.getElementById('convertBtn').disabled=false}
  updateLimitUI();
}
function delay(ms){return new Promise(r=>setTimeout(r,ms))}
function animSteps(steps,base=400){return(async()=>{for(const s of steps){updateOverlay(s.p,s.t);await delay(base+Math.random()*200)}})()}
function readAsUrl(f){return new Promise((r,j)=>{const re=new FileReader();re.onload=()=>r(re.result);re.onerror=j;re.readAsDataURL(f)})}
function loadImg(src){return new Promise((r,j)=>{const i=new Image();i.onload=()=>r(i);i.onerror=j;i.src=src})}
function renderPage(page,scale=1.5){const vp=page.getViewport({scale});const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;return page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise.then(()=>({canvas:c,w:vp.width,h:vp.height}))}
function parsePages(s){const p=new Set();s.split(',').forEach(part=>{part=part.trim();if(part.includes('-')){const[a,b]=part.split('-').map(Number);for(let i=a;i<=b;i++)p.add(i)}else{const n=parseInt(part);if(!isNaN(n))p.add(n)}});return Array.from(p).sort((a,b)=>a-b)}

// === Conversions ===
async function cvPdfToText(steps){animSteps(steps,500);const ab=await uploadedFiles[0].arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;let txt='';for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const c=await pg.getTextContent();txt+=c.items.map(it=>it.str).join(' ')+'\n\n';updateOverlay(10+80*i/pdf.numPages,'Page '+i+'/'+pdf.numPages);await delay(80)}return{type:'text',text:txt,fileName:uploadedFiles[0].name.replace('.pdf','')+'.txt',info:pdf.numPages+' page(s)'}}
async function cvImageToPdf(steps){const{jsPDF}=window.jspdf;animSteps(steps,300);const doc=new jsPDF();for(let i=0;i<uploadedFiles.length;i++){if(i>0)doc.addPage();const url=await readAsUrl(uploadedFiles[i]);const img=await loadImg(url);const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();const r=Math.min(pw/img.width,ph/img.height,1);doc.addImage(url,'JPEG',(pw-img.width*r)/2,(ph-img.height*r)/2,img.width*r,img.height*r);updateOverlay(20+70*i/uploadedFiles.length,'Image '+(i+1));await delay(100)}return{type:'blob',blob:doc.output('blob'),fileName:'images.pdf',info:uploadedFiles.length+' image(s)'}}
async function cvTextToPdf(steps){const{jsPDF}=window.jspdf;animSteps(steps,400);const txt=document.getElementById('textInput').value;const doc=new jsPDF();doc.setFont('helvetica');doc.setFontSize(12);const lines=doc.splitTextToSize(txt,170);const ph=doc.internal.pageSize.getHeight()-40;let y=20,i=0;while(i<lines.length){if(y+7>ph+20){doc.addPage();y=20}doc.text(lines[i],20,y);y+=7;i++}return{type:'blob',blob:doc.output('blob'),fileName:'texte.pdf',info:lines.length+' ligne(s)'}}
async function cvPdfToImage(steps){animSteps(steps,400);const ab=await uploadedFiles[0].arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;const imgs=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const{canvas}=await renderPage(pg,2);imgs.push(canvas.toDataURL('image/png'));updateOverlay(10+85*i/pdf.numPages,'Page '+i);await delay(120)}return{type:'images',images:imgs,fileName:uploadedFiles[0].name.replace('.pdf',''),info:imgs.length+' image(s)'}}
async function cvPdfToWord(steps){animSteps(steps,500);const ab=await uploadedFiles[0].arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;let html='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Calibri,sans-serif;font-size:12pt}p{margin:0 0 8px}</style></head><body>';for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const c=await pg.getTextContent();html+='<p style="page-break-after:always"><b>--- Page '+i+' ---</b></p>';c.items.forEach(it=>html+='<p>'+it.str+'</p>');updateOverlay(10+85*i/pdf.numPages,'Page '+i);await delay(80)}html+='</body></html>';return{type:'blob',blob:new Blob([html],{type:'application/msword'}),fileName:uploadedFiles[0].name.replace('.pdf','')+'.doc',info:pdf.numPages+' page(s)'}}
async function cvPdfToExcel(steps){animSteps(steps,500);const ab=await uploadedFiles[0].arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;let csv='';for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const c=await pg.getTextContent();let lastY=null;c.items.forEach(it=>{const y=Math.round(it.transform[5]);if(lastY!==null&&Math.abs(y-lastY)>5)csv+='\n';else if(lastY!==null)csv+=',';csv+='"'+it.str.replace(/"/g,'""')+'"';lastY=y});csv+='\n\n';updateOverlay(10+85*i/pdf.numPages,'Page '+i);await delay(80)}return{type:'blob',blob:new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),fileName:uploadedFiles[0].name.replace('.pdf','')+'.csv',info:pdf.numPages+' page(s)'}}
async function cvMergePdf(steps){const{jsPDF}=window.jspdf;animSteps(steps,300);const all=[];for(const f of uploadedFiles){const pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;for(let p=1;p<=pdf.numPages;p++){const pg=await pdf.getPage(p);const{canvas,w,h}=await renderPage(pg,1.5);all.push({img:canvas.toDataURL('image/jpeg',.9),w,h})}}updateOverlay(60,'Fusion...');await delay(200);const doc=new jsPDF();all.forEach((pg,idx)=>{if(idx>0)doc.addPage();const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();const r=Math.min(pw/pg.w,ph/pg.h);doc.addImage(pg.img,'JPEG',(pw-pg.w*r)/2,(ph-pg.h*r)/2,pg.w*r,pg.h*r)});return{type:'blob',blob:doc.output('blob'),fileName:'fusionne.pdf',info:all.length+' page(s)'}}
async function cvHtmlToPdf(steps){const{jsPDF}=window.jspdf;animSteps(steps,400);const html=document.getElementById('textInput').value;const d=new DOMParser().parseFromString(html,'text/html');const txt=d.body?d.body.textContent:html;const doc=new jsPDF();doc.setFont('helvetica');doc.setFontSize(11);const lines=doc.splitTextToSize(txt,170);const ph=doc.internal.pageSize.getHeight()-40;let y=20,i=0;while(i<lines.length){if(y+6>ph+20){doc.addPage();y=20}doc.text(lines[i],20,y);y+=6;i++}return{type:'blob',blob:doc.output('blob'),fileName:'html.pdf',info:lines.length+' ligne(s)'}}
async function cvSplitPdf(steps){const{jsPDF}=window.jspdf;animSteps(steps,400);const pages=parsePages(document.getElementById('pageRangeInput').value||'1');const ab=await uploadedFiles[0].arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;const doc=new jsPDF();let added=false;for(const p of pages){if(p<1||p>pdf.numPages)continue;if(added)doc.addPage();const pg=await pdf.getPage(p);const{canvas,w,h}=await renderPage(pg,1.5);const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();const r=Math.min(pw/w,ph/h);doc.addImage(canvas.toDataURL('image/jpeg',.9),'JPEG',(pw-w*r)/2,(ph-h*r)/2,w*r,h*r);added=true;updateOverlay(20+70*pages.indexOf(p)/pages.length,'Page '+p);await delay(80)}return{type:'blob',blob:doc.output('blob'),fileName:'extrait.pdf',info:pages.length+' page(s)'}}
async function cvRotatePdf(steps){const{jsPDF}=window.jspdf;animSteps(steps,400);const ab=await uploadedFiles[0].arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;const doc=new jsPDF({orientation:'landscape'});for(let i=1;i<=pdf.numPages;i++){if(i>1)doc.addPage();const pg=await pdf.getPage(i);const{canvas,w,h}=await renderPage(pg,1.5);const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();const r=Math.min(pw/h,ph/w);doc.addImage(canvas.toDataURL('image/jpeg',.9),'JPEG',(pw-h*r)/2,(ph-w*r)/2,h*r,w*r);updateOverlay(10+85*i/pdf.numPages,'Page '+i);await delay(80)}return{type:'blob',blob:doc.output('blob'),fileName:'pivote.pdf',info:pdf.numPages+' page(s) pivotee(s)'}}
async function cvWatermarkPdf(steps){const{jsPDF}=window.jspdf;animSteps(steps,400);const wm=document.getElementById('watermarkInput').value||'CONFIDENTIEL';const ab=await uploadedFiles[0].arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;const doc=new jsPDF();for(let i=1;i<=pdf.numPages;i++){if(i>1)doc.addPage();const pg=await pdf.getPage(i);const{canvas,w,h}=await renderPage(pg,1.5);const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();const r=Math.min(pw/w,ph/h);const iw=w*r,ih=h*r;doc.addImage(canvas.toDataURL('image/jpeg',.9),'JPEG',(pw-iw)/2,(ph-ih)/2,iw,ih);doc.saveGraphicsState();doc.setGState(new doc.GState({opacity:.12}));doc.setFontSize(48);doc.setTextColor(180,0,0);doc.text(wm,pw/2,ph/2,{angle:Math.atan2(ph,pw),align:'center'});doc.restoreGraphicsState();updateOverlay(10+85*i/pdf.numPages,'Page '+i);await delay(80)}return{type:'blob',blob:doc.output('blob'),fileName:'filigrane.pdf',info:pdf.numPages+' page(s), "'+wm+'"'}}
async function cvCompressPdf(steps){const{jsPDF}=window.jspdf;animSteps(steps,400);const ab=await uploadedFiles[0].arrayBuffer();const pdf=await pdfjsLib.getDocument({data:ab}).promise;const doc=new jsPDF();const origSize=uploadedFiles[0].size;for(let i=1;i<=pdf.numPages;i++){if(i>1)doc.addPage();const pg=await pdf.getPage(i);const{canvas,w,h}=await renderPage(pg,1);const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();const r=Math.min(pw/w,ph/h);doc.addImage(canvas.toDataURL('image/jpeg',.5),'JPEG',(pw-w*r)/2,(ph-h*r)/2,w*r,h*r);updateOverlay(10+85*i/pdf.numPages,'Page '+i);await delay(80)}const blob=doc.output('blob');return{type:'blob',blob:blob,fileName:'compresse.pdf',info:pdf.numPages+' page(s), -'+Math.round((1-blob.size/origSize)*100)+'%'}}

// ===== RESULTAT =====
function showResult(r){document.getElementById('resultArea').style.display='block';document.getElementById('resultInfo').textContent=r.info;const tr=document.getElementById('textResult'),btn=document.getElementById('downloadBtn');
  if(r.type==='text'){tr.style.display='block';document.getElementById('extractedText').textContent=r.text.substring(0,5000)+(r.text.length>5000?'\n\n...':'');btn.innerHTML='<i class="fas fa-download"></i> Telecharger'}
  else if(r.type==='images'){tr.style.display='block';const c=document.getElementById('extractedText');c.textContent='';const w=document.createElement('div');w.style.cssText='display:flex;flex-wrap:wrap;gap:10px';r.images.forEach((img,i)=>{const d=document.createElement('div');d.style.textAlign='center';d.innerHTML='<img src="'+img+'" style="max-width:160px;border-radius:6px;border:1px solid #E2E8F0"><p style="font-size:11px;color:#94A3B8;margin-top:4px">Page '+(i+1)+'</p>';w.appendChild(d)});c.appendChild(w);btn.innerHTML='<i class="fas fa-download"></i> Telecharger'}
  else{tr.style.display='none';btn.innerHTML='<i class="fas fa-download"></i> Telecharger le PDF'}
  document.getElementById('convertBtn').disabled=false;toast('Conversion terminee !','success')}
function downloadResult(){if(!conversionResult)return;const r=conversionResult;if(r.type==='text')dlBlob(new Blob([r.text],{type:'text/plain;charset=utf-8'}),r.fileName);else if(r.type==='images')r.images.forEach((img,i)=>{const a=document.createElement('a');a.href=img;a.download=r.fileName+'_page_'+(i+1)+'.png';a.click()});else dlBlob(r.blob,r.fileName)}
function dlBlob(b,n){const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=n;a.click();URL.revokeObjectURL(u)}

// ===== PRICING =====
let pricingMode = 'monthly';
const PLANS = [
  {id:'free',name:'Gratuit',badge:'Gratuit',badgeClass:'pc-badge-free',priceM:0,priceY:0,desc:'Pour decouvrir',features:['3 outils gratuits','3 conversions / 48h','Fichiers max 5 Mo','Traitement local'],['Fichiers max 5 Mo'],['Conversions illimitees','Fichiers max 50 Mo','12 outils','Priorite'],btnText:'Commencer',btnClass:'btn-pc-outline',popular:false},
  {id:'pro',name:'Pro',badge:'Pro',badgeClass:'pc-badge-pro',priceM:0.99,priceY:0.59,desc:'Pour les particuliers',features:['Conversions illimitees','Fichiers max 50 Mo','Tous les 12 outils','Historique complet'],[],['Conversions illimitees','Fichiers max 50 Mo','12 outils','Priorite'],btnText:'S\'abonner',btnClass:'btn-modal-primary pc-btn',popular:true,stripeKey:'pro'},
  {id:'biz',name:'Business',badge:'Business',badgeClass:'pc-badge-biz',priceM:9.99,priceY:5.99,desc:'Pour les equipes',features:['Tout Pro inclus','5 comptes membres','Support prioritaire','Marque blanche'],[],['Conversions illimitees','Fichiers max 100 Mo','12 outils','Support VIP'],btnText:'S\'abonner',btnClass:'btn-pc-outline pc-btn',popular:false,stripeKey:'biz'},
  {id:'ent',name:'Entreprise',badge:'Entreprise',badgeClass:'pc-badge-ent',priceM:99.99,priceY:59.99,desc:'Sur mesure',features:['Tout Business inclus','Comptes illimites','API d\'acces','SLA garanti','Contact dedie'],[],['Conversions illimitees','Fichiers illimites','12 outils','Support 24/7'],btnText:'Nous contacter',btnClass:'btn-pc-outline pc-btn',popular:false}
];
function setPricing(mode){pricingMode=mode;document.getElementById('ptMonthly').classList.toggle('active',mode==='monthly');document.getElementById('ptYearly').classList.toggle('active',mode==='yearly');buildPricing()}
function buildPricing(){
  const grid=document.getElementById('pricingGrid');grid.innerHTML='';
  PLANS.forEach(plan=>{
    const price=pricingMode==='monthly'?plan.priceM:plan.priceY;
    const card=document.createElement('div');card.className='pricing-card'+(plan.popular?' popular':'');
    card.innerHTML=`
      ${plan.popular?'<div class="popular-tag">LE PLUS POPULAIRE</div>':''}
      <div class="${plan.badgeClass}">${plan.badge}</div>
      <div class="pc-price"><span class="pc-amount">${price===0?'Gratuit':price.toFixed(2).replace('.',',')}</span>${price>0?'<span class="pc-currency">&euro;</span>':''}</div>
      <div class="pc-period">${price===0?'Pour toujours':pricingMode==='monthly'?'/mois':'/mois (annuel)'}</div>
      <ul class="pc-features">${plan.features[pricingMode==='monthly'?0:1].map(f=>'<li><i class="fas fa-check"></i> '+f+'</li>').join('')}</ul>
      <button class="${plan.btnClass}" onclick="${plan.id==='free'?'handleFreePlan()':plan.id==='ent'?'toast(\'Contactez-nous pour un devis\',\'info\')':'handleProPlan(\''+plan.id+'\')'}">${plan.btnText}</button>`;
    grid.appendChild(card);
  });
}

// ===== DASHBOARD =====
function refreshDashboard(){
  const u=getUser();if(!u)return;refreshCycle(u);
  document.getElementById('dashUsername').textContent=u.name;document.getElementById('dashUsed').textContent=u.isPro?'Illimite':(u.cycleUsed||0);document.getElementById('dashLimit').textContent=u.isPro?'':'sur '+FREE_LIMIT;document.getElementById('dashTotal').textContent=u.totalConversions||0;
  const badge=document.getElementById('dashBadge'),upBtn=document.getElementById('dashUpgradeBtn');
  if(u.isPro){badge.className='badge-pro';badge.innerHTML='<i class="fas fa-crown"></i> Pro';upBtn.style.display='none'}else{badge.className='badge-free';badge.textContent='Gratuit';upBtn.style.display='inline-flex'}
  const circ=2*Math.PI*34;if(!u.isPro){const rem=getTimeLeft(u),frac=rem/CYCLE_MS;const tc=document.getElementById('timerCircle');tc.style.strokeDasharray=circ;tc.style.strokeDashoffset=circ*(1-frac);tc.style.stroke='#2B7BF5';document.getElementById('timerText').textContent=fmtTime(rem)}else{document.getElementById('timerCircle').style.strokeDashoffset=0;document.getElementById('timerCircle').style.stroke='#10B981';document.getElementById('timerText').textContent='--'}
  const list=document.getElementById('historyList');
  if(!u.history||!u.history.length){list.innerHTML='<div class="table-empty"><i class="fas fa-inbox"></i><p>Aucune conversion</p></div>'}
  else{const names={'pdf-to-text':'PDF→Texte','pdf-to-image':'PDF→Image','image-to-pdf':'Image→PDF','text-to-pdf':'Texte→PDF','pdf-to-word':'PDF→Word','pdf-to-excel':'PDF→Excel','merge-pdf':'Fusion','html-to-pdf':'HTML→PDF','split-pdf':'Split','rotate-pdf':'Rotation','watermark-pdf':'Filigrane','compress-pdf':'Compression'};
  list.innerHTML=u.history.slice(0,20).map(h=>'<div class="table-row"><span style="display:flex;align-items:center;gap:6px"><i class="fas fa-file" style="color:#94A3B8;font-size:11px"></i> '+h.fileName+'</span><span style="color:#2B7BF5;font-size:12px">'+(names[h.tool]||h.tool)+'</span><span style="color:#94A3B8;font-size:12px">'+new Date(h.date).toLocaleDateString('fr-FR')+'</span><span style="color:#10B981;font-size:12px"><i class="fas fa-check-circle"></i></span></div>').join('')}
}
function clearHistory(){const u=getUser();if(!u)return;u.history=[];saveUser(u);refreshDashboard();toast('Historique efface','info')}

// ===== STRIPE =====
function processStripeCheckout(){
  const u=getUser();if(!u){openModal('login');return}if(u.isPro){toast('Deja abonne','info');return}
  const planId=selectedPlan;
  const priceKey=STRIPE_PRICES[planId];
  if(!priceKey||STRIPE_PK==='VOTRE_CLE_PUBLIQUE_STRIPE'){
    const btn=document.getElementById('stripeCheckoutBtn');btn.disabled=true;btn.innerHTML='<i class="fas fa-exclamation-triangle"></i> Non configure';
    const h=document.getElementById('stripeHelp');h.style.display='block';h.innerHTML='<strong>Configuration Stripe requise :</strong><br>1. Creez un compte sur <a href="https://dashboard.stripe.com/register" target="_blank">stripe.com</a><br>2. Liez votre compte bancaire<br>3. Creez 3 produits (0.99€, 9.99€, 99.99€)<br>4. Copiez les cles dans script.js';return}
  const btn=document.getElementById('stripeCheckoutBtn');btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Ouverture...';
  try{if(!stripeInstance)stripeInstance=Stripe(STRIPE_PK);
    stripeInstance.redirectToCheckout({lineItems:[{price:priceKey,quantity:1}],mode:'subscription',successUrl:location.origin+location.pathname+'?upgrade=success&uid='+u.id+'&plan='+planId,cancelUrl:location.origin+location.pathname+'?upgrade=cancel',customerEmail:u.email,locale:'fr'})
    .then(r=>{if(r.error){toast(r.error.message,'error');btn.disabled=false;btn.innerHTML='<i class="fas fa-credit-card"></i> Payer avec Stripe'}});
  }catch(e){toast('Erreur','error');btn.disabled=false;btn.innerHTML='<i class="fas fa-credit-card"></i> Payer avec Stripe'}}
}
function checkStripeReturn(){
  const p=new URLSearchParams(location.search);const uid=p.get('uid'),s=p.get('upgrade'),plan=p.get('plan');
  if(s==='success'&&uid){const us=getUsers(),u=us[uid];if(u){u.isPro=true;if(plan==='biz')u.planType='business';if(plan==='ent')u.planType='enterprise';saveUser(u);currentUser=u;updateNav();toast('Bienvenue dans le plan '+(plan||'Pro')+' !','success')}history.replaceState({},'',location.pathname)}
  else if(s==='cancel'){toast('Paiement annule','info');history.replaceState({},'',location.pathname)}
}
function handleFreePlan(){const u=getUser();if(!u){openModal('register')}else navigate('tools')}
function handleProPlan(planId){selectedPlan=planId||'pro';const u=getUser();if(!u){openModal('register');toast('Creez un compte','info');return}if(u.isPro){toast('Deja abonne','info');return}
  const planNames={pro:'Pro',biz:'Business',ent:'Entreprise'};const planDescs={pro:'Illimite',biz:'Equipe',ent:'Sur mesure'};
  const planPrices={pro:'0,99€',biz:'9,99€',ent:'99,99€'};
  document.getElementById('subPlanName').textContent='Plan '+planNames[selectedPlan];document.getElementById('subPlanDesc').textContent=planDescs[selectedPlan];document.getElementById('subPlanPrice').innerHTML=planPrices[selectedPlan]+'<span>/mois</span>';
  const h=document.getElementById('stripeHelp');h.style.display='none';const btn=document.getElementById('stripeCheckoutBtn');btn.disabled=false;btn.innerHTML='<i class="fas fa-credit-card"></i> Payer avec Stripe';openModal('subscribe')}

// ===== TIMER =====
setInterval(()=>{const u=getUser();if(!u||u.isPro)return;const rem=getTimeLeft(u),circ=2*Math.PI*34;const tc=document.getElementById('timerCircle'),tt=document.getElementById('timerText');if(tc&&tt){tc.style.strokeDasharray=circ;tc.style.strokeDashoffset=circ*(1-rem/CYCLE_MS);tt.textContent=fmtTime(rem)}if(rem===0&&u.cycleUsed>0){refreshCycle(u);updateLimitUI();if(document.getElementById('page-dashboard').classList.contains('page-visible'))refreshDashboard();toast('Quota renouvele !','success')}},1000);

document.getElementById('textInput').addEventListener('input',function(){if(TOOLS[currentTool].hasText)document.getElementById('convertBtn').disabled=!this.value.trim()});
window.addEventListener('scroll',()=>document.getElementById('header').classList.toggle('header-scrolled',window.scrollY>20));

// ===== INIT =====
document.addEventListener('DOMContentLoaded',()=>{
  currentUser=getUser();updateNav();buildToolsGrid();buildPricing();checkStripeReturn();
  // Dupliquer les images pour le scroll infini
  const hvb=document.querySelector('.hvb-inner');if(hvb)hvb.innerHTML+=hvb.innerHTML;
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
