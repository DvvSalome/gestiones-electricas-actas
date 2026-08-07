// --- Dynamic Materials Table ---
function addMaterialRow(desc = "", cant = "", ref = "") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" class="mat-input-field desc-input" placeholder="Ej. Breaker Schneider 2x20A" value="${desc}" autocorrect="off" spellcheck="false"></td>
    <td><input type="number" class="mat-input-field cant-input" placeholder="1" style="text-align:center;" value="${cant}"></td>
    <td><input type="text" class="mat-input-field ref-input" placeholder="Ej. Ref. QO220" value="${ref}" autocorrect="off" spellcheck="false"></td>
    <td style="text-align:center;">
      <button type="button" class="remove-row-btn" onclick="removeMaterialRow(this)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
    </td>
  `;
  window.materialsTbody.appendChild(tr);
  
  // Listener para guardar al editar
  tr.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", saveCurrentFormToLocal);
  });
  
  saveCurrentFormToLocal();
}

function removeMaterialRow(button) {
  button.closest("tr").remove();
  saveCurrentFormToLocal();
}
