let currentTool = '';

function openTool(id, title) {
    currentTool = id;
    document.getElementById('categories-grid').classList.add('hidden');
    document.getElementById('work-zone').classList.remove('hidden');
    document.getElementById('tool-title').innerText = title;
    
    if(id === 'compress') document.getElementById('compression-options').classList.remove('hidden');
}

function goBack() {
    document.getElementById('work-zone').classList.add('hidden');
    document.getElementById('preview-zone').classList.add('hidden');
    document.getElementById('categories-grid').classList.remove('hidden');
}

document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('preview-zone').classList.remove('hidden');
        document.getElementById('file-name-display').innerText = `Fichier : ${file.name}`;
        
        document.getElementById('main-action-btn').onclick = () => processFile(file);
    }
});

async function processFile(file) {
    const btn = document.getElementById('main-action-btn');
    btn.innerText = "Traitement...";
    btn.disabled = true;

    try {
        if (currentTool === 'compress') {
            const zip = new JSZip();
            zip.file(file.name, file);
            const level = parseInt(document.getElementById('comp-level').value);
            const blob = await zip.generateAsync({type:"blob", compression: "DEFLATE", compressionOptions: {level}});
            download(blob, file.name + ".zip");
        } else {
            alert("Action terminée pour : " + file.name);
        }
    } catch (err) {
        alert("Erreur lors du traitement.");
    }

    btn.innerText = "Lancer";
    btn.disabled = false;
    goBack();
}

function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
}