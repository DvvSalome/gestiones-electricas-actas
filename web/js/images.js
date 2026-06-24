// --- Image Upload & Base64 previews ---
function handleImageUpload(input, type) {
  if (!input.files || !input.files[0]) return;
  
  const file = input.files[0];
  const reader = new FileReader();
  
  reader.onload = function(e) {
    // Reducir la imagen un poco antes de procesarla para optimizar rendimiento del PDF
    compressImage(e.target.result, 600, (compressedBase64) => {
      window.imagesInMemory[type] = compressedBase64;
      
      const previewDiv = document.getElementById(`preview-${type}`);
      previewDiv.innerHTML = `
        <img src="${compressedBase64}">
        <div class="photo-overlay">
          <span>Slot ${type}</span>
        </div>
        <button type="button" class="remove-photo-btn" onclick="removePhoto('${type}', event)">×</button>
      `;
      
      updateTimelineProgress();
    });
  };
  
  reader.readAsDataURL(file);
}

function removePhoto(type, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  
  window.imagesInMemory[type] = "";
  document.getElementById(`img-${type}`).value = "";
  document.getElementById(`preview-${type}`).innerHTML = "";
  updateTimelineProgress();
}
