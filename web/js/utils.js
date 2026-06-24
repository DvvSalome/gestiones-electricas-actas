// Monkeypatch canvas getContext to automatically set willReadFrequently: true.
// This resolves the Chromium warning about multiple readback operations inside html2canvas / html2pdf.
(function() {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, contextAttributes) {
    if (type === '2d') {
      if (!contextAttributes) {
        contextAttributes = {};
      }
      contextAttributes.willReadFrequently = true;
    }
    return originalGetContext.call(this, type, contextAttributes);
  };
})();

// Verifies if canvas is empty/blank
function isCanvasBlank(canvasDom) {
  const blank = document.createElement('canvas');
  blank.width = canvasDom.width;
  blank.height = canvasDom.height;
  return canvasDom.toDataURL() === blank.toDataURL();
}

// Client-side simple image compression
function compressImage(base64Str, maxWidth, callback) {
  const img = new Image();
  img.src = base64Str;
  img.onload = () => {
    const canvasObj = document.createElement("canvas");
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }

    canvasObj.width = width;
    canvasObj.height = height;
    const ctxImg = canvasObj.getContext("2d", { willReadFrequently: true });
    ctxImg.drawImage(img, 0, 0, width, height);
    
    // Retorna JPEG con calidad 0.7 para que no pese demasiado
    callback(canvasObj.toDataURL("image/jpeg", 0.7));
  };
}
