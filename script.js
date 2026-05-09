const fileInput = document.getElementById('fileInput');
const uploadView = document.getElementById('upload-view');
const processView = document.getElementById('process-view');
const fileName = document.getElementById('file-name');

fileInput.onchange = function() {
    if(fileInput.files.length > 0) {
        uploadView.classList.add('hidden');
        processView.classList.remove('hidden');
        fileName.innerText = fileInput.files[0].name;
    }
}

document.getElementById('convert-btn').onclick = async function() {
    const file = fileInput.files[0];
    this.innerText = "Traitement...";
    
    // Simuler le traitement
    setTimeout(() => {
        alert("Félicitations ! Fichier converti.");
        location.reload(); // Revenir au début
    }, 2000);
}
