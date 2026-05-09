const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const statusDiv = document.getElementById('uploadStatus');
const progressBar = document.querySelector('.progress');
const statusText = document.getElementById('statusText');

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleUpload(file);
});

function handleUpload(file) {
    statusDiv.classList.remove('hidden');
    document.querySelector('.drop-icon').style.display = 'none';
    document.querySelector('h3').style.display = 'none';
    document.querySelector('.btn-select').style.display = 'none';
    
    let progress = 0;
    const interval = setInterval(() => {
        progress += 5;
        progressBar.style.width = progress + "%";
        statusText.innerText = "Traitement de " + file.name + "...";
        
        if (progress >= 100) {
            clearInterval(interval);
            statusText.innerHTML = "✅ Terminé ! <a href='#' style='color:blue'>Télécharger ici</a>";
        }
    }, 200);
}
