// Visualizador 3D da camiseta oficial (secao #camiseta da home).
//
// Mesmo cuidado do carousel.js: o runtime da home re-renderiza o conteudo do
// <x-dc>, entao os listeners usam delegation no document e a rotacao e
// reaplicada a cada frame buscando o elemento de novo — se o card for
// recriado pelo re-render, o frame seguinte ja restaura a pose.

const AUTO_SPEED = 24; // graus por segundo no giro automatico
const IDLE_MS = 3500; // espera apos interacao antes de voltar a girar sozinho
const DRAG_FACTOR = 0.55; // graus por pixel arrastado
const FRICTION = 0.94; // decaimento da inercia por frame

let rotY = -24;
let rotX = 8;
let velY = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
let lastInteraction = 0;

function stageFrom(target) {
  return target instanceof Element ? target.closest(".shirt3d-stage") : null;
}

export function initShirt3d() {
  if (!document.querySelector(".shirt3d-stage")) return;

  document.addEventListener("pointerdown", (event) => {
    const stage = stageFrom(event.target);
    if (!stage) return;
    dragging = true;
    velY = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    lastInteraction = Date.now();
    stage.classList.add("is-dragging");
  });

  document.addEventListener(
    "pointermove",
    (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      rotY += dx * DRAG_FACTOR;
      rotX = Math.max(-16, Math.min(16, rotX - dy * 0.12));
      velY = dx * DRAG_FACTOR;
      lastInteraction = Date.now();
    },
    { passive: true },
  );

  for (const type of ["pointerup", "pointercancel"]) {
    document.addEventListener(type, () => {
      if (!dragging) return;
      dragging = false;
      lastInteraction = Date.now();
      document
        .querySelectorAll(".shirt3d-stage.is-dragging")
        .forEach((el) => el.classList.remove("is-dragging"));
    });
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let lastFrame = performance.now();

  const frame = (now) => {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (!dragging) {
      // Inercia do arrasto e, depois de um tempo parado, giro automatico.
      rotY += velY;
      velY *= FRICTION;
      if (Math.abs(velY) < 0.02) velY = 0;
      const idle = Date.now() - lastInteraction > IDLE_MS;
      if (idle && !reduceMotion.matches && !document.hidden) {
        rotY += AUTO_SPEED * dt;
        rotX += (8 - rotX) * dt; // volta suavemente a inclinacao padrao
      }
    }

    const card = document.querySelector(".shirt3d-card");
    if (card) card.style.transform = `rotateX(${-rotX}deg) rotateY(${rotY}deg)`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
