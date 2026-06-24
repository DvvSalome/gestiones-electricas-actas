// --- Checklist States Cycle ---
function cycleCheckState(element) {
  const idx = element.getAttribute("data-index");
  const statusSpan = element.querySelector(".check-status");
  
  if (!element.classList.contains("ok") && !element.classList.contains("fail")) {
    // Cambiar a Conforme (OK)
    element.classList.add("ok");
    statusSpan.textContent = "OK";
    window.checklistItems[idx].state = "ok";
  } else if (element.classList.contains("ok")) {
    // Cambiar a Falla
    element.classList.remove("ok");
    element.classList.add("fail");
    statusSpan.textContent = "FALLA";
    window.checklistItems[idx].state = "fail";
  } else {
    // Volver a neutral
    element.classList.remove("fail");
    statusSpan.textContent = "";
    window.checklistItems[idx].state = "";
  }
  
  saveCurrentFormToLocal();
  updateTimelineProgress();
}
