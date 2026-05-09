// Ajoute ces titres dans ta fonction openTool
const titles = {
    'img-pdf': 'Image vers PDF',
    'png-jpg': 'Convertir PNG en JPG',
    'txt-pdf': 'Texte vers PDF',
    'compress': 'Compression ZIP'
};

// Modifie la fonction processAction pour inclure les nouveaux cas
async function processAction(file) {
    executeBtn.disabled = true;
    executeBtn.innerText = "Traitement en cours... ⚡";

    try {
        if (currentTool === 'png-jpg') {
            await convertImageFormat(file, 'image/jpeg', 'jpg');
        } 
        else if (currentTool === 'txt-pdf') {
            await convertTxtToPdf(file);
        }
        else if (currentTool === 'compress') {
            const zip = new JSZip();
            zip.file(file.name, file);
            const content = await zip.generateAsync({type: "blob"});
            downloadBlob(content, file.name + ".zip");
        } 
        else {
            await new Promise(resolve => setTimeout(resolve, 1500));
            alert("Action simulée avec succès !");
        }
    } catch (error) {
        alert("Erreur de traitement : " + error.message);
    } finally {
        executeBtn.disabled = false;
        executeBtn.innerText = "Convertir maintenant";
        closeModal();
    }
}

// Nouvelle fonction pour convertir les images (PNG <-> JPG)
function convertImageFormat(file, targetFormat, extension) {
    return new Promise((resolve) => {
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
                    downloadBlob(blob, file.name.split('.')[0] + "." + extension);
                    resolve();
                }, targetFormat);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Nouvelle fonction pour transformer du texte en PDF simple
async function convertTxtToPdf(file) {
    const text = await file.text();
    const pdfDoc = await PDFLib.PDFDocument.create();
    const page = pdfDoc.addPage();
    page.drawText(text, { x: 50, y: 700, size: 12 });
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    downloadBlob(blob, file.name.split('.')[0] + ".pdf");
}
