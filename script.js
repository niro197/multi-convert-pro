/* ================================================================
   PDFShift — Logique applicative
   ================================================================ */

// ============================================================
// CONFIGURATION STRIPE
// ============================================================
// >>> REMPLACEZ CES VALEURS PAR VOS VRAIES CLES STRIPE <<<
//
// 1. Creez un compte sur https://dashboard.stripe.com/register
// 2. Creez un "Produit" avec un prix de 0.99 EUR recurrent mensuel
// 3. Copiez votre cle publique (pk_...) depuis
//    https://dashboard.stripe.com/apikeys
// 4. Copiez l'ID du prix (price_...) depuis
//    https://dashboard.stripe.com/products
// 5. Le paiement sera envoye sur le compte bancaire lie a Stripe
//
const STRIPE_PUBLIC_KEY = 'VOTRE_CLE_PUBLIQUE_STRIPE'; // ex: pk_live_...
const STRIPE_PRICE_ID   = 'VOTRE_ID_PRIX';            // ex: price_1ABC...

let stripeInstance = null;

// ============================================================
// pdf.js config
// ============================================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
// Constantes
// ============================================================
const FREE_LIMIT = 3;
const CYCLE_MS = 48 * 60 * 60 * 1000; // 48h

// ============================================================
// Etat
// ============================================================
let currentUser = null;
let currentTool = 'pdf-to-text';
let uploadedFiles = [];
let conversionResult = null;

// Definition des outils
const TOOLS = {
  'pdf-to-text': {
    title: 'PDF vers Texte',
    desc: 'Extrayez le texte de vos fichiers PDF',
    icon: 'fa-file-alt',
    color: '#0A7CFF',
    bg: '#EEF4FF',
    accept: '.pdf',
    multiple: false,
    hasText: false
  },
  'pdf-to-image': {
    title: 'PDF vers Image',
    desc: 'Convertissez vos pages PDF en images PNG',
    icon: 'fa-image',
    color: '#059669',
    bg: '#ECFDF5',
    accept: '.pdf',
    multiple: false,
    hasText: false
  },
  'image-to-pdf': {
    title: 'Image vers PDF',
    desc: 'Transformez vos images en document PDF',
    icon: 'fa-file-image',
    color: '#EA580C',
    bg: '#FFF7ED',
    accept: '.jpg,.jpeg,.png',
    multiple: true,
    hasText: false
  },
  'text-to-pdf': {
    title: 'Texte vers PDF',
    desc: 'Convertissez votre texte en document PDF',
    icon: 'fa-pen-nib',
    color: '#D97706',
    bg: '#FEF3C7',
    accept: null,
    multiple: false,
    hasText: true
  },
  'merge-pdf': {
    title: 'Fusionner des PDF',
    desc: 'Combinez plusieurs fichiers PDF en un seul',
    icon: 'fa-layer-group',
    color: '#DC2626',
    bg: '#FEE2E2',
    accept: '.pdf',
    multiple: true,
    hasText: false
  },
  'html-to-pdf': {
    title: 'HTML vers PDF',
    desc: 'Convertissez votre code HTML en PDF',
    icon: 'fa-code',
    color: '#9333EA',
    bg: '#F3E8FF',
    accept: null,
    multiple: false,
    hasText: true
  }
};

// ============================================================
// LocalStorage — Gestion des utilisateurs
// ============================================================
function getUsers() {
  return JSON.parse(localStorage.getItem('pdfshift_users') || '{}');
}
function saveUsers(users) {
  localStorage.setItem('pdfshift_users', JSON.stringify(users));
}
function getUser() {
  const id = localStorage.getItem('pdfshift_session');
  if (!id) return null;
  return getUsers()[id] || null;
}
function saveUser(user) {
  const users = getUsers();
  users[user.id] = user;
  saveUsers(users);
  currentUser = user;
}

// ============================================================
// Systeme de limites (cycle de 48h)
// ============================================================
function refreshCycle(user) {
  const now = Date.now();
  if (!user.cycleStart) {
    user.cycleStart = now;
    user.cycleUsed = 0;
    saveUser(user);
    return;
  }
  if (now - user.cycleStart >= CYCLE_MS) {
    user.cycleStart = now;
    user.cycleUsed = 0;
    saveUser(user);
  }
}

function getRemaining(user) {
  if (user.isPro) return Infinity;
  refreshCycle(user);
  return Math.max(0, FREE_LIMIT - (user.cycleUsed || 0));
}

function consumeConversion(user) {
  if (user.isPro) {
    user.totalConversions = (user.totalConversions || 0) + 1;
    saveUser(user);
    return true;
  }
  if (getRemaining(user) <= 0) return false;
  user.cycleUsed = (user.cycleUsed || 0) + 1;
  user.totalConversions = (user.totalConversions || 0) + 1;
  saveUser(user);
  return true;
}

function getTimeLeft(user) {
  refreshCycle(user);
  return Math.max(0, CYCLE_MS - (Date.now() - user.cycleStart));
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'min';
  return m + 'min ' + String(sec).padStart(2, '0') + 's';
}

// ============================================================
// Navigation
// ============================================================
function navigate(page) {
  if (page === 'dashboard' && !getUser()) {
    openModal('login');
    toast('Connectez-vous pour acceder au tableau de bord', 'info');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.replace('page-visible', 'page-hidden'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.replace('page-hidden', 'page-visible');

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (page === 'dashboard') refreshDashboard();
}

// ============================================================
// Toast
// ============================================================
function toast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  const t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.innerHTML = '<i class="fas ' + icons[type] + '"></i> ' + msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(-8px)';
    t.style.transition = 'all 0.3s';
    setTimeout(() => t.remove(), 300);
  }, 4000);
}

// ============================================================
// Modals
// ============================================================
function openModal(id) {
  document.getElementById('modalOverlay').style.display = 'flex';
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  document.getElementById('modal-' + id).style.display = 'block';
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  document.body.style.overflow = '';
}
function switchModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  document.getElementById('modal-' + id).style.display = 'block';
}

// ============================================================
// Authentification
// ============================================================
function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const pw = document.getElementById('regPassword').value;
  const pw2 = document.getElementById('regPasswordConfirm').value;

  if (pw !== pw2) { toast('Les mots de passe ne correspondent pas', 'error'); return; }

  const users = getUsers();
  if (Object.values(users).find(u => u.email === email)) {
    toast('Un compte avec cet e-mail existe deja', 'error'); return;
  }

  const user = {
    id: 'u_' + Date.now(),
    name, email,
    password: btoa(pw),
    isPro: false,
    cycleStart: Date.now(),
    cycleUsed: 0,
    totalConversions: 0,
    history: [],
    createdAt: Date.now()
  };
  users[user.id] = user;
  saveUsers(users);
  localStorage.setItem('pdfshift_session', user.id);
  currentUser = user;
  closeModal();
  updateNav();
  toast('Bienvenue ' + name + ', votre compte a ete cree !', 'success');
}

function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pw = document.getElementById('loginPassword').value;
  const users = getUsers();
  const user = Object.values(users).find(u => u.email === email);

  if (!user || atob(user.password) !== pw) {
    toast('E-mail ou mot de passe incorrect', 'error'); return;
  }
  localStorage.setItem('pdfshift_session', user.id);
  currentUser = user;
  closeModal();
  updateNav();
  toast('Bon retour, ' + user.name + ' !', 'success');
}

function logout() {
  localStorage.removeItem('pdfshift_session');
  currentUser = null;
  updateNav();
  navigate('home');
  toast('Vous etes deconnecte', 'info');
}

function togglePassword(id, btn) {
  const inp = document.getElementById(id);
  const icon = btn.querySelector('i');
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    inp.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

function checkPasswordStrength(pw) {
  const bars = document.querySelectorAll('#strengthBars > div');
  const txt = document.getElementById('strengthText');
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  const colors = ['#E5E7EB', '#DC2626', '#D97706', '#0A7CFF', '#059669'];
  const labels = ['', 'Faible', 'Moyen', 'Bon', 'Excellent'];
  bars.forEach((b, i) => b.style.background = i < s ? colors[s] : '#E5E7EB');
  txt.textContent = pw.length > 0 ? labels[s] : '';
  txt.style.color = colors[s];
}

// ============================================================
// Mise a jour navigation selon auth
// ============================================================
function updateNav() {
  const user = getUser();
  const auth = document.getElementById('navAuth');
  const dash = document.getElementById('navDashboard');
  if (user) {
    dash.style.display = 'inline-flex';
    auth.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:30px;height:30px;background:#EEF4FF;border-radius:8px;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-user" style="color:#0A7CFF;font-size:12px;"></i>
        </div>
        <span style="font-size:13px;font-weight:600;color:var(--fg-secondary);">${user.name}</span>
        ${user.isPro ? '<span style="background:#EEF4FF;color:#0A7CFF;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">PRO</span>' : ''}
      </div>
      <button class="btn-text" onclick="logout()" style="color:#DC2626;font-size:13px;">
        <i class="fas fa-sign-out-alt"></i>
      </button>`;
  } else {
    dash.style.display = 'none';
    auth.innerHTML = `
      <button class="btn-text" onclick="openModal('login')">Connexion</button>
      <button class="btn-primary-sm" onclick="openModal('register')">S'inscrire</button>`;
  }
}

// ============================================================
// Selection d'outil
// ============================================================
function selectTool(id) {
  currentTool = id;
  const t = TOOLS[id];

  document.getElementById('toolTitle').textContent = t.title;
  document.getElementById('toolDesc').textContent = t.desc;
  const icon = document.getElementById('toolIcon');
  icon.innerHTML = '<i class="fas ' + t.icon + '"></i>';
  icon.style.background = t.bg;
  icon.style.color = t.color;

  const fi = document.getElementById('fileInput');
  if (t.accept) {
    fi.accept = t.accept;
    fi.multiple = t.multiple;
    document.getElementById('acceptedFormats').textContent = 'Formats acceptes : ' + t.accept.toUpperCase().replace(/\./g, '').replace(/,/g, ', ');
    document.getElementById('dropZone').style.display = 'block';
  } else {
    document.getElementById('dropZone').style.display = 'none';
  }

  document.getElementById('textInputArea').style.display = t.hasText ? 'block' : 'none';
  document.getElementById('textInput').value = '';
  document.getElementById('textInput').placeholder = id === 'text-to-pdf' ? 'Collez votre texte ici...' : 'Collez votre code HTML ici...';

  uploadedFiles = [];
  conversionResult = null;
  resetToolUI();
  updateLimitUI();
  navigate('tools');
}

function resetToolUI() {
  document.getElementById('dropContent').style.display = 'block';
  document.getElementById('filePreview').style.display = 'none';
  document.getElementById('convertBtn').disabled = true;
  document.getElementById('progressArea').style.display = 'none';
  document.getElementById('resultArea').style.display = 'none';
  document.getElementById('textResult').style.display = 'none';
}

function clearFile() {
  uploadedFiles = [];
  document.getElementById('fileInput').value = '';
  resetToolUI();
}

function updateLimitUI() {
  const user = getUser();
  const banner = document.getElementById('limitBanner');
  if (user && user.isPro) { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  const rem = user ? getRemaining(user) : FREE_LIMIT;
  const pct = (rem / FREE_LIMIT) * 100;
  document.getElementById('limitText').textContent = rem + ' conversion' + (rem !== 1 ? 's' : '') + ' restante' + (rem !== 1 ? 's' : '');
  const fill = document.getElementById('limitProgress');
  fill.style.width = pct + '%';
  fill.style.background = rem === 0 ? '#DC2626' : rem === 1 ? '#D97706' : '#D97706';
}

// ============================================================
// Upload / Drop zone
// ============================================================
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', e => handleFiles(e.target.files));

function handleFiles(files) {
  if (!files || !files.length) return;
  const user = getUser();
  if (!user) { toast('Connectez-vous pour utiliser les outils', 'warning'); openModal('login'); return; }

  const tool = TOOLS[currentTool];
  uploadedFiles = Array.from(files);

  for (const f of uploadedFiles) {
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    if (tool.accept && !tool.accept.includes(ext)) {
      toast('Format non supporte. Utilisez : ' + tool.accept, 'error');
      uploadedFiles = []; return;
    }
    const max = user.isPro ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (f.size > max) {
      toast('Fichier trop volumineux. Limite : ' + (user.isPro ? '50' : '5') + ' Mo', 'error');
      uploadedFiles = []; return;
    }
  }

  document.getElementById('dropContent').style.display = 'none';
  const prev = document.getElementById('filePreview');
  prev.style.display = 'flex';
  if (uploadedFiles.length === 1) {
    prev.querySelector('i').className = 'fas fa-file-pdf';
    prev.querySelector('i').style.fontSize = '36px';
    document.getElementById('fileName').textContent = uploadedFiles[0].name;
    document.getElementById('fileSize').textContent = fmtSize(uploadedFiles[0].size);
  } else {
    prev.querySelector('i').className = 'fas fa-copy';
    prev.querySelector('i').style.fontSize = '36px';
    document.getElementById('fileName').textContent = uploadedFiles.length + ' fichiers selectionnes';
    document.getElementById('fileSize').textContent = uploadedFiles.map(f => fmtSize(f.size)).join(', ');
  }
  document.getElementById('convertBtn').disabled = false;
  updateLimitUI();
}

function fmtSize(b) {
  if (b < 1024) return b + ' o';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' Ko';
  return (b / 1048576).toFixed(2) + ' Mo';
}

// ============================================================
// Conversion
// ============================================================
async function startConversion() {
  const user = getUser();
  if (!user) { openModal('login'); return; }

  const tool = TOOLS[currentTool];
  if (!tool.hasText && !uploadedFiles.length) { toast('Selectionnez un fichier', 'warning'); return; }
  if (tool.hasText && !document.getElementById('textInput').value.trim()) { toast('Saisissez du texte', 'warning'); return; }

  if (!consumeConversion(user)) {
    toast('Limite atteinte ! Renouvellement dans ' + fmtTime(getTimeLeft(user)), 'error');
    updateLimitUI();
    return;
  }

  document.getElementById('convertBtn').disabled = true;
  document.getElementById('progressArea').style.display = 'block';
  document.getElementById('resultArea').style.display = 'none';

  try {
    let result;
    switch (currentTool) {
      case 'pdf-to-text':  result = await cvPdfToText(); break;
      case 'pdf-to-image': result = await cvPdfToImage(); break;
      case 'image-to-pdf': result = await cvImageToPdf(); break;
      case 'text-to-pdf':  result = await cvTextToPdf(); break;
      case 'merge-pdf':    result = await cvMergePdf(); break;
      case 'html-to-pdf':  result = await cvHtmlToPdf(); break;
    }
    conversionResult = result;

    // Historique
    user.history.unshift({ id: Date.now(), tool: currentTool, fileName: result.fileName, date: Date.now(), status: 'ok' });
    if (user.history.length > 50) user.history = user.history.slice(0, 50);
    saveUser(user);

    showResult(result);
  } catch (err) {
    console.error(err);
    toast('Erreur : ' + err.message, 'error');
    document.getElementById('progressArea').style.display = 'none';
    document.getElementById('convertBtn').disabled = false;
  }
  updateLimitUI();
}

// Animation de progression
function animProgress(text, dur = 1800) {
  return new Promise(resolve => {
    const bar = document.getElementById('conversionProgress');
    const pct = document.getElementById('progressPercent');
    document.getElementById('progressText').textContent = text;
    let start = null;
    function step(ts) {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      bar.style.width = (e * 100) + '%';
      pct.textContent = Math.round(e * 100) + '%';
      if (p < 1) requestAnimationFrame(step); else resolve();
    }
    requestAnimationFrame(step);
  });
}

// --- PDF → Texte ---
async function cvPdfToText() {
  await animProgress('Lecture du fichier PDF...', 1200);
  const ab = await uploadedFiles[0].arrayBuffer();
  await animProgress('Extraction du texte...', 1400);
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  let txt = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const c = await pg.getTextContent();
    txt += c.items.map(it => it.str).join(' ') + '\n\n';
  }
  await animProgress('Finalisation...', 400);
  return { type: 'text', text: txt, fileName: uploadedFiles[0].name.replace('.pdf', '') + '.txt', info: pdf.numPages + ' page(s) extraite(s)' };
}

// --- PDF → Image ---
async function cvPdfToImage() {
  await animProgress('Chargement du PDF...', 1000);
  const ab = await uploadedFiles[0].arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
  const imgs = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    await animProgress('Rendu page ' + i + '/' + pdf.numPages + '...', 700);
    const pg = await pdf.getPage(i);
    const vp = pg.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    imgs.push(canvas.toDataURL('image/png'));
  }
  await animProgress('Finalisation...', 300);
  return { type: 'images', images: imgs, fileName: uploadedFiles[0].name.replace('.pdf', ''), info: imgs.length + ' image(s) generee(s)' };
}

// --- Image → PDF ---
async function cvImageToPdf() {
  const { jsPDF } = window.jspdf;
  for (let i = 0; i < uploadedFiles.length; i++) await animProgress('Traitement image ' + (i + 1) + '/' + uploadedFiles.length + '...', 500);
  const doc = new jsPDF();
  for (let i = 0; i < uploadedFiles.length; i++) {
    if (i > 0) doc.addPage();
    const url = await readAsUrl(uploadedFiles[i]);
    const img = await loadImg(url);
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
    const r = Math.min(pw / img.width, ph / img.height, 1);
    doc.addImage(url, 'JPEG', (pw - img.width * r) / 2, (ph - img.height * r) / 2, img.width * r, img.height * r);
  }
  await animProgress('Generation du PDF...', 400);
  return { type: 'blob', blob: doc.output('blob'), fileName: 'images-vers-pdf.pdf', info: uploadedFiles.length + ' image(s) convertie(s)' };
}

// --- Texte → PDF ---
async function cvTextToPdf() {
  const { jsPDF } = window.jspdf;
  const txt = document.getElementById('textInput').value;
  await animProgress('Mise en forme...', 1000);
  const doc = new jsPDF();
  doc.setFont('helvetica'); doc.setFontSize(12);
  const lines = doc.splitTextToSize(txt, 170);
  const ph = doc.internal.pageSize.getHeight() - 40;
  let y = 20, i = 0;
  while (i < lines.length) {
    if (y + 7 > ph + 20) { doc.addPage(); y = 20; }
    doc.text(lines[i], 20, y); y += 7; i++;
  }
  await animProgress('Generation du PDF...', 400);
  return { type: 'blob', blob: doc.output('blob'), fileName: 'texte-vers-pdf.pdf', info: lines.length + ' ligne(s)' };
}

// --- Fusionner PDF ---
async function cvMergePdf() {
  if (uploadedFiles.length < 2) throw new Error('Selectionnez au moins 2 fichiers PDF');
  const { jsPDF } = window.jspdf;
  for (let i = 0; i < uploadedFiles.length; i++) await animProgress('Lecture PDF ' + (i + 1) + '/' + uploadedFiles.length + '...', 500);
  const pages = [];
  for (const f of uploadedFiles) {
    const pdf = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
    for (let p = 1; p <= pdf.numPages; p++) {
      const pg = await pdf.getPage(p);
      const vp = pg.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      pages.push({ img: c.toDataURL('image/jpeg', 0.92), w: vp.width, h: vp.height });
    }
  }
  await animProgress('Fusion...', 700);
  const doc = new jsPDF();
  pages.forEach((pg, idx) => {
    if (idx > 0) doc.addPage();
    const pw = doc.internal.pageSize.getWidth(), ph = doc.internal.pageSize.getHeight();
    const r = Math.min(pw / pg.w, ph / pg.h);
    doc.addImage(pg.img, 'JPEG', (pw - pg.w * r) / 2, (ph - pg.h * r) / 2, pg.w * r, pg.h * r);
  });
  await animProgress('Finalisation...', 300);
  return { type: 'blob', blob: doc.output('blob'), fileName: 'pdf-fusionne.pdf', info: pages.length + ' page(s) fusionnee(s)' };
}

// --- HTML → PDF ---
async function cvHtmlToPdf() {
  const { jsPDF } = window.jspdf;
  const html = document.getElementById('textInput').value;
  await animProgress('Analyse du HTML...', 800);
  const doc2 = new DOMParser().parseFromString(html, 'text/html');
  const txt = doc2.body ? doc2.body.textContent : html;
  const doc = new jsPDF();
  doc.setFont('helvetica'); doc.setFontSize(11);
  const lines = doc.splitTextToSize(txt, 170);
  const ph = doc.internal.pageSize.getHeight() - 40;
  let y = 20, i = 0;
  while (i < lines.length) {
    if (y + 6 > ph + 20) { doc.addPage(); y = 20; }
    doc.text(lines[i], 20, y); y += 6; i++;
  }
  await animProgress('Generation du PDF...', 400);
  return { type: 'blob', blob: doc.output('blob'), fileName: 'html-vers-pdf.pdf', info: lines.length + ' ligne(s)' };
}

// Utilitaires
function readAsUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// ============================================================
// Afficher le resultat
// ============================================================
function showResult(r) {
  document.getElementById('progressArea').style.display = 'none';
  document.getElementById('resultArea').style.display = 'block';
  document.getElementById('resultInfo').textContent = r.info;

  const tr = document.getElementById('textResult');
  const btn = document.getElementById('downloadBtn');

  if (r.type === 'text') {
    tr.style.display = 'block';
    document.getElementById('extractedText').textContent = r.text.substring(0, 5000) + (r.text.length > 5000 ? '\n\n... (tronque)' : '');
    btn.innerHTML = '<i class="fas fa-download"></i> Telecharger le fichier texte';
  } else if (r.type === 'images') {
    tr.style.display = 'block';
    const c = document.getElementById('extractedText');
    c.textContent = '';
    const w = document.createElement('div');
    w.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
    r.images.forEach((img, i) => {
      const d = document.createElement('div');
      d.style.textAlign = 'center';
      d.innerHTML = '<img src="' + img + '" style="max-width:180px;border-radius:8px;border:1px solid #E5E7EB;"><p style="font-size:11px;color:#8A8F98;margin-top:4px;">Page ' + (i + 1) + '</p>';
      w.appendChild(d);
    });
    c.appendChild(w);
    btn.innerHTML = '<i class="fas fa-download"></i> Telecharger les images';
  } else {
    tr.style.display = 'none';
    btn.innerHTML = '<i class="fas fa-download"></i> Telecharger le PDF';
  }
  document.getElementById('convertBtn').disabled = false;
  toast('Conversion terminee avec succes !', 'success');
}

function downloadResult() {
  if (!conversionResult) return;
  const r = conversionResult;
  if (r.type === 'text') {
    dlBlob(new Blob([r.text], { type: 'text/plain;charset=utf-8' }), r.fileName);
  } else if (r.type === 'images') {
    r.images.forEach((img, i) => {
      const a = document.createElement('a');
      a.href = img; a.download = r.fileName + '_page_' + (i + 1) + '.png'; a.click();
    });
  } else {
    dlBlob(r.blob, r.fileName);
  }
}
function dlBlob(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  URL.revokeObjectURL(u);
}

// ============================================================
// Dashboard
// ============================================================
function refreshDashboard() {
  const user = getUser();
  if (!user) return;
  refreshCycle(user);

  document.getElementById('dashUsername').textContent = user.name;
  document.getElementById('dashUsed').textContent = user.isPro ? 'Illimite' : (user.cycleUsed || 0);
  document.getElementById('dashLimit').textContent = user.isPro ? '' : 'sur ' + FREE_LIMIT;
  document.getElementById('dashTotal').textContent = user.totalConversions || 0;

  const badge = document.getElementById('dashBadge');
  const upBtn = document.getElementById('dashUpgradeBtn');
  if (user.isPro) {
    badge.className = 'badge-pro';
    badge.innerHTML = '<i class="fas fa-crown"></i> Pro';
    upBtn.style.display = 'none';
  } else {
    badge.className = 'badge-free';
    badge.textContent = 'Gratuit';
    upBtn.style.display = 'inline-flex';
  }

  // Timer
  const circ = 2 * Math.PI * 34;
  if (!user.isPro) {
    const rem = getTimeLeft(user);
    const frac = rem / CYCLE_MS;
    document.getElementById('timerCircle').style.strokeDasharray = circ;
    document.getElementById('timerCircle').style.strokeDashoffset = circ * (1 - frac);
    document.getElementById('timerCircle').style.stroke = '#0A7CFF';
    document.getElementById('timerText').textContent = fmtTime(rem);
  } else {
    document.getElementById('timerCircle').style.strokeDashoffset = 0;
    document.getElementById('timerCircle').style.stroke = '#059669';
    document.getElementById('timerText').textContent = '--';
  }

  // Historique
  const list = document.getElementById('historyList');
  if (!user.history || !user.history.length) {
    list.innerHTML = '<div class="table-empty"><i class="fas fa-inbox"></i><p>Aucune conversion pour le moment</p></div>';
  } else {
    const names = {
      'pdf-to-text': 'PDF → Texte', 'pdf-to-image': 'PDF → Image',
      'image-to-pdf': 'Image → PDF', 'text-to-pdf': 'Texte → PDF',
      'merge-pdf': 'Fusion PDF', 'html-to-pdf': 'HTML → PDF'
    };
    list.innerHTML = user.history.slice(0, 20).map(h =>
      '<div class="table-row">' +
        '<span style="display:flex;align-items:center;gap:6px;"><i class="fas fa-file" style="color:#8A8F98;font-size:12px;"></i> ' + h.fileName + '</span>' +
        '<span style="color:#0A7CFF;font-size:13px;">' + (names[h.tool] || h.tool) + '</span>' +
        '<span style="color:#8A8F98;font-size:13px;">' + new Date(h.date).toLocaleDateString('fr-FR') + '</span>' +
        '<span style="color:#059669;font-size:13px;"><i class="fas fa-check-circle"></i></span>' +
      '</div>'
    ).join('');
  }
}

function clearHistory() {
  const user = getUser();
  if (!user) return;
  user.history = [];
  saveUser(user);
  refreshDashboard();
  toast('Historique efface', 'info');
}

// ============================================================
// Stripe — Paiement
// ============================================================
function processStripeCheckout() {
  const user = getUser();
  if (!user) { openModal('login'); return; }
  if (user.isPro) { toast('Vous etes deja abonne au plan Pro', 'info'); return; }

  // Verifier que les cles Stripe sont configurees
  if (STRIPE_PUBLIC_KEY === 'VOTRE_CLE_PUBLIQUE_STRIPE' || STRIPE_PRICE_ID === 'VOTRE_ID_PRIX') {
    toast('Configuration Stripe requise. Consultez le fichier script.js pour configurer vos cles.', 'warning');
    // Afficher les instructions
    const btn = document.getElementById('stripeCheckoutBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Stripe non configure';

    // Ajouter un message d'aide sous le bouton
    let helpEl = document.querySelector('.stripe-help');
    if (!helpEl) {
      helpEl = document.createElement('div');
      helpEl.className = 'stripe-help';
      helpEl.style.cssText = 'margin-top:16px;padding:14px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;font-size:12px;color:#92400E;line-height:1.6;';
      document.getElementById('modal-subscribe').appendChild(helpEl);
    }
    helpEl.innerHTML = '<strong>Pour recevoir les paiements :</strong><br>' +
      '1. Creez un compte sur <a href="https://dashboard.stripe.com/register" target="_blank" style="color:#0A7CFF;">stripe.com</a><br>' +
      '2. Liez votre compte bancaire dans les parametres<br>' +
      '3. Creez un produit recurrent a 0.99 EUR/mois<br>' +
      '4. Copiez votre cle publique (pk_...) et l\'ID du prix (price_...)<br>' +
      '5. Remplacez les valeurs dans le fichier script.js';
    return;
  }

  // Initialiser Stripe et rediriger vers Checkout
  const btn = document.getElementById('stripeCheckoutBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ouverture du paiement...';

  try {
    if (!stripeInstance) {
      stripeInstance = Stripe(STRIPE_PUBLIC_KEY);
    }

    stripeInstance.redirectToCheckout({
      lineItems: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      successUrl: window.location.origin + window.location.pathname + '?upgrade=success&uid=' + user.id,
      cancelUrl: window.location.origin + window.location.pathname + '?upgrade=cancel',
      customerEmail: user.email,
      locale: 'fr'
    }).then(function(result) {
      if (result.error) {
        toast(result.error.message, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-credit-card"></i> Payer avec Stripe';
      }
    });
  } catch (err) {
    toast('Erreur Stripe : ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-credit-card"></i> Payer avec Stripe';
  }
}

// Verifier le retour Stripe apres paiement
function checkStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const uid = params.get('uid');
  const status = params.get('upgrade');

  if (status === 'success' && uid) {
    const users = getUsers();
    const user = users[uid];
    if (user) {
      user.isPro = true;
      saveUser(user);
      currentUser = user;
      updateNav();
      toast('Paiement accepte ! Bienvenue dans le plan Pro', 'success');
    }
    // Nettoyer l'URL
    window.history.replaceState({}, '', window.location.pathname);
  } else if (status === 'cancel') {
    toast('Paiement annule', 'info');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ============================================================
// Plans
// ============================================================
function handleFreePlan() {
  const user = getUser();
  if (!user) { openModal('register'); } else { navigate('tools'); toast('Plan gratuit actif', 'info'); }
}
function handleProPlan() {
  const user = getUser();
  if (!user) { openModal('register'); toast('Creez un compte pour vous abonner', 'info'); return; }
  if (user.isPro) { toast('Vous etes deja Pro', 'info'); return; }
  openModal('subscribe');
}

// ============================================================
// Compteur anime (accueil)
// ============================================================
function animCounter(id, target, dur = 1800) {
  const el = document.getElementById(id);
  if (!el) return;
  let start = null;
  function step(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / dur, 1);
    el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target).toLocaleString('fr-FR');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ============================================================
// Timer de renouvellement (chaque seconde)
// ============================================================
setInterval(() => {
  const user = getUser();
  if (!user || user.isPro) return;
  const rem = getTimeLeft(user);
  const circ = 2 * Math.PI * 34;
  const tc = document.getElementById('timerCircle');
  const tt = document.getElementById('timerText');
  if (tc && tt) {
    tc.style.strokeDasharray = circ;
    tc.style.strokeDashoffset = circ * (1 - rem / CYCLE_MS);
    tt.textContent = fmtTime(rem);
  }
  if (rem === 0 && user.cycleUsed > 0) {
    refreshCycle(user);
    updateLimitUI();
    if (document.getElementById('page-dashboard').classList.contains('page-visible')) refreshDashboard();
    toast('Votre quota de conversions a ete renouvele !', 'success');
  }
}, 1000);

// ============================================================
// Input texte → activer bouton
// ============================================================
document.getElementById('textInput').addEventListener('input', function () {
  if (TOOLS[currentTool].hasText) {
    document.getElementById('convertBtn').disabled = !this.value.trim();
  }
});

// ============================================================
// Init
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  currentUser = getUser();
  updateNav();
  checkStripeReturn();

  const total = Object.values(getUsers()).reduce((s, u) => s + (u.totalConversions || 0), 0);
  animCounter('statConversions', Math.max(total, 1247));
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
