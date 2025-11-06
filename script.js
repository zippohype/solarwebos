// Minimal script: only the live clock + dat

function updateClock(){
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  const clockEl = document.getElementById('clock');
  const dateEl = document.getElementById('date');
  if(clockEl) clockEl.textContent = `${hh}:${mm}:${ss}`;
  if(dateEl) dateEl.textContent = now.toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'});
}

setInterval(updateClock, 1000);
updateClock();
