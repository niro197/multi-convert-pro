const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');

// Empêcher le comportement par défaut du navigateur
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Animation au survol
dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

// Gestion du dépôt de fichier
dropZone.addEventListener('drop', (e) => {
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    handleFiles(files);
});

fileInput.addEventListener('change', function() {
    handleFiles(this.files);
});

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        fileList.innerHTML = `
            <div style="margin-top:20px; padding:15px; background:#e2e8f0; border-radius:10px;">
                <strong>Fichier sélectionné :</strong> ${file.name} <br>
                <progress id="progressBar" value="0" max="100" style="width:100%; margin-top:10px;"></progress>
                <p id="status">Préparation de la conversion...</p>
            </div>
        `;
        simulateConversion();
    }
}

function simulateConversion() {
    let progress = 0;
    const bar = document.getElementById('progressBar');
    const status = document.getElementById('status');

    const interval = setInterval(() => {
        progress += 5;
        bar.value = progress;
        
        if (progress === 40) status.innerText = "Analyse du document...";
        if (progress === 70) status.innerText = "Génération du PDF...";
        
        if (progress >= 100) {
            clearInterval(interval);
            status.innerHTML = "✨ <strong>Conversion terminée !</strong>";
            alert("Conversion réussie ! (Ceci est une démo)");
        }
    }, 150);
}
