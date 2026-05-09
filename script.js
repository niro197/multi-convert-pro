const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const statusDiv = document.getElementById('uploadStatus');

// Drag & Drop effects
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = "#4F46E5";
    dropZone.style.background = "#F5F3FF";
});

dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = "#E2E8F0";
    dropZone.style.background = "white";
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    handleUpload(files[0]);
});

fileInput.addEventListener('change', (e) => {
    handleUpload(e.target.files[0]);
});

function handleUpload(file) {
    if (!file) return;
    
    // Cacher les textes et montrer la barre de progression
    statusDiv.classList.remove('hidden');
    document.querySelector('.drop-icon').classList.add('hidden');
    document.querySelector('.btn-select').classList.add('hidden');
    
    let progress = 0;
    const progressBar = document.querySelector('.progress');
    const statusText = document.getElementById('statusText');

    const interval = setInterval(() => {
        progress += Math.random() * 15;
        if (progress > 100) progress = 100;
        
        progressBar.style.width = progress + "%";
        
        if (progress < 40) statusText.innerText = "Téléchargement de " + file.name + "...";
        else if (progress < 80) statusText.innerText = "Conversion en cours...";
        else if (progress < 100) statusText.innerText = "Finalisation...";
        else {
            clearInterval(interval);
            statusText.innerHTML = "✅ Terminé ! <a href='#' style='color:#4F46E5'>Télécharger ici</a>";
        }
    }, 400);
}
