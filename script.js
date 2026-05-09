let currentTool = 'txt-pdf';
const converterContainer = document.getElementById('drop-zone');
const innerDropzone = document.querySelector('.inner-dropzone');
const processingZone = document.getElementById('processing-zone');
const fileInput = document.getElementById('fileInput');

function setTool(id, title, color) {
    currentTool = id;
    document.getElementById('main-title').innerText = title;
    converterContainer.style.background = color;
    
    // Reset interface
    innerDropzone.classList.remove('hidden');
    processingZone.classList.add('hidden');
}

fileInput.onchange = function() {
    if (fileInput.files.length > 0) {
        innerDropzone.classList.add('hidden');
        processingZone.classList.remove('hidden');
        document.getElementById('file-name-display').innerText = "Fichier sélectionné : " + fileInput.files[0].name;
    }
};

document.getElementById('execute-btn').onclick = async function() {
    const file = fileInput.files[0];
    const btn = document.getElementById('execute-btn');
    btn.innerText = "Conversion en cours...";

    try {
        if (currentTool === 'compress') {
            const zip = new JSZip();
            zip.file(file.name, file);
            const content = await zip.generateAsync({type: "blob"});
            downloadFile(content, file.name + ".zip");
        } 
        else if (currentTool === 'txt-pdf') {
            const text = await file.text();
            const pdfDoc = await PDFLib.PDFDocument.create();
            const page = pdfDoc.addPage();
            page.drawText(text, { x: 50, y: 700, size: 12 });
            const pdfBytes = await pdfDoc.save();
            downloadFile(new Blob([pdfBytes]), file.name + ".pdf");
        }
    } catch (e) {
        alert("Erreur : " + e.message);
    }
    
    btn.innerText = "Terminé !";
    setTimeout(() => setTool(currentTool, document.getElementById('main-title').innerText, converterContainer.style.background), 2000);
};

function downloadFile(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
