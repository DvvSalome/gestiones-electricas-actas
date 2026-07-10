// --- Image Upload & Base64 previews ---
function handleImageUpload(input, type) {
  if (!input.files || !input.files[0]) return;
  
  const file = input.files[0];
  const reader = new FileReader();
  
  reader.onload = function(e) {
    // Reducir la imagen un poco antes de procesarla para optimizar rendimiento del PDF
    compressImage(e.target.result, 1000, (compressedBase64) => {
      window.imagesInMemory[type] = compressedBase64;

      const isExtra = type.startsWith("extra-");
      const removeCall = isExtra ? `removeExtraPhotoSlot('${type}', event)` : `removePhoto('${type}', event)`;
      const overlayLabel = isExtra ? "Adicional" : type;

      const previewDiv = document.getElementById(`preview-${type}`);
      previewDiv.innerHTML = `
        <img src="${compressedBase64}">
        <div class="photo-overlay">
          <span>${overlayLabel}</span>
        </div>
        <button type="button" class="remove-photo-btn" onclick="${removeCall}">×</button>
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

// --- Evidencias adicionales dinámicas (hasta MAX_TOTAL_IMAGES en total) ---
function totalPhotoSlots() {
  // 4 fijas + las adicionales activas
  return 4 + window.extraSlots.length;
}

function updatePhotoCounter() {
  const counter = document.getElementById("photo-counter");
  if (counter) counter.textContent = `${totalPhotoSlots()} / ${window.MAX_TOTAL_IMAGES} espacios`;
  const btn = document.getElementById("btn-add-photo");
  if (btn) {
    const full = totalPhotoSlots() >= window.MAX_TOTAL_IMAGES;
    btn.disabled = full;
    btn.style.opacity = full ? "0.5" : "1";
    btn.style.cursor = full ? "not-allowed" : "pointer";
    btn.textContent = full ? "Límite de 10 imágenes alcanzado" : "+ Agregar evidencia";
  }
}

function addExtraPhotoSlot() {
  if (totalPhotoSlots() >= window.MAX_TOTAL_IMAGES) return;

  const key = `extra-${++window.extraSlotCounter}`;
  window.extraSlots.push(key);
  window.imagesInMemory[key] = "";

  const grid = document.getElementById("extra-photo-grid");
  const slot = document.createElement("div");
  slot.className = "photo-slot";
  slot.id = `slot-container-${key}`;
  slot.innerHTML = `
    <button type="button" class="remove-photo-btn" style="z-index:5;" title="Quitar espacio" onclick="removeExtraPhotoSlot('${key}', event)">×</button>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>
    </svg>
    <span>Evidencia<br>Adicional</span>
    <input type="file" accept="image/*" capture="environment" id="img-${key}" onchange="handleImageUpload(this, '${key}')">
    <div id="preview-${key}"></div>`;
  grid.appendChild(slot);

  updatePhotoCounter();
}

// Elimina por completo un slot adicional (imagen + recuadro).
function removeExtraPhotoSlot(key, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  delete window.imagesInMemory[key];
  window.extraSlots = window.extraSlots.filter(k => k !== key);
  const el = document.getElementById(`slot-container-${key}`);
  if (el) el.remove();
  updatePhotoCounter();
  updateTimelineProgress();
}
