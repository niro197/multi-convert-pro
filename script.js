// --- CONFIGURATION ET ÉTAT ---
let currentTool = '';
const modal = document.getElementById('modal');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('file-info');
const fileNameDisplay = document.getElementById('file-name');
const executeBtn = document.getElementById('execute-btn');
const dropZone = document.getElementById('drop-zone');

// Noms des outils pour l'affichage
const toolTitles = {
    'img-pdf': 'Image vers PDF',
    'png-jpg': 'Convertir PNG en JPG',
    'txt-pdf': 'Texte vers PDF',
    'compress': 'Compression ZIP'
};

// --- GESTION DE L'INTERFACE (MODAL) ---

function openTool(toolId) {
    currentTool = toolId;
    document.getElementById('modal-title').innerText = toolTitles[toolId] || 'Outil';
    modal.classList.remove('hidden');
    
    // Réinitialiser l'interface de la modal
    fileInfo.classList.add('hidden');
    dropZone.classList.remove('hidden');
    fileInput.value = ''; 
}

function closeModal() {
    modal.classList.add('hidden');
}

// Fermer si on clique à côté de la fenêtre
window.onclick = function(event) {
    if (event.target == modal) closeModal();
}

// --- GESTION DES FICHIERS ---

fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        dropZone.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        fileNameDisplay.innerText = `Fichier : ${file.name}`;
        
        // Préparer le bouton d'exécution
        executeBtn.onclick = () => processAction(file);
    }
});

async function processAction(file) {
    executeBtn.disabled = true;
    executeBtn.innerText = "Traitement en cours... ⚡";

    try {
        if (currentTool === 'png-jpg') {
            await convertImageToJpg(file);
        } 
        else if (currentTool === 'txt-pdf') {
            await convertTxtToPdf(file);
        }
        else if (currentTool === 'compress') {
            await createZip(file);
        } 
        else if (currentTool === 'img-pdf') {
            alert("L'outil Image vers PDF sera finalisé dans la prochaine mise à jour !");
        }
    } catch (error) {
        console.error(error);
        alert("Erreur : " + error.message);
    } finally {
        executeBtn.disabled = false;
        executeBtn.innerText = "Démarrer la conversion";
        closeModal();
    }
}

// --- LOGIQUE DE CONVERSION RÉELLE ---

// 1. Conversion PNG -> JPG
async function convertImageToJpg(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                canvas.toBlob((blob) => {
                    downloadBlob(blob, file.name.split('.')[0] + ".jpg");
                    resolve();
                }, 'image/jpeg', 0.9);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// 2. Conversion Texte -> PDF (Utilise PDF-Lib)
async function convertTxtToPdf(file) {
    const text = await file.text();
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();

    page.drawText(text, {
        x: 50,
        y: height - 50,
        size: 12,
        font: font,
        color: rgb(0, 0, 0),
        maxWidth: width - 100
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    downloadBlob(blob, file.name.split('.')[0] + ".pdf");
}

// 3. Compression ZIP (Utilise JSZip)
async function createZip(file) {
    const zip = new JSZip();
    zip.file(file.name, file);
    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, file.name + ".zip");
}

// --- UTILITAIRE DE TÉLÉCHARGEMENT ---

function downloadBlob(blob, name) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}
