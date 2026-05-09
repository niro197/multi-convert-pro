// Gestion de l'état de l'application
let currentTool = '';
const modal = document.getElementById('modal');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('file-info');
const fileNameDisplay = document.getElementById('file-name');
const executeBtn = document.getElementById('execute-btn');

/**
 * Ouvre l'outil sélectionné avec une animation
 */
function openTool(toolId) {
    currentTool = toolId;
    const titles = {
        'img-pdf': 'Image vers PDF',
        'compress': 'Compression ZIP',
        'video': 'Optimiseur Vidéo'
    };
    
    document.getElementById('modal-title').innerText = titles[toolId] || 'Outil';
    modal.classList.remove('hidden');
    // Réinitialisation de l'interface
    fileInfo.classList.add('hidden');
    document.getElementById('drop-zone').classList.remove('hidden');
}

/**
 * Ferme la fenêtre modal
 */
function closeModal() {
    modal.classList.add('hidden');
    fileInput.value = ''; // Reset du fichier
}

/**
 * Détecte le choix d'un fichier
 */
fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        showFileDetails(file);
    }
});

/**
 * Affiche le nom du fichier et prépare le bouton d'action
 */
function showFileDetails(file) {
    document.getElementById('drop-zone').classList.add('hidden');
    fileInfo.classList.remove('hidden');
    fileNameDisplay.innerText = `Fichier prêt : ${file.name}`;
    
    executeBtn.onclick = () => processAction(file);
}

/**
 * Simule ou exécute le traitement du fichier
 */
async function processAction(file) {
    executeBtn.disabled = true;
    executeBtn.innerText = "Traitement en cours... ⚡";

    try {
        if (currentTool === 'compress') {
            // Logique de compression ZIP réelle
            const zip = new JSZip();
            zip.file(file.name, file);
            const content = await zip.generateAsync({type: "blob"});
            downloadBlob(content, file.name + ".zip");
        } else {
            // Simulation pour les autres outils (Image/Vidéo)
            await new Promise(resolve => setTimeout(resolve, 2000));
            alert(`Succès ! Le fichier ${file.name} a été traité par l'outil ${currentTool}.`);
        }
    } catch (error) {
        console.error(error);
        alert("Oups, une erreur est survenue pendant le traitement.");
    } finally {
        executeBtn.disabled = false;
        executeBtn.innerText = "Convertir maintenant";
        closeModal();
    }
}

/**
 * Fonction utilitaire pour télécharger le résultat
 */
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

// Fermer la modal si on clique en dehors du cadre blanc
window.onclick = function(event) {
    if (event.target == modal) {
        closeModal();
    }
}
