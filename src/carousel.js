// Carrossel de fotos do CTA final.
//
// O runtime da home re-renderiza o conteudo do <x-dc>, entao nada aqui pode
// depender de listeners presos a elementos: os cliques usam delegation no
// document e os dots sao reconstruidos pelo tick sempre que sumirem.

const AUTOPLAY_MS = 5000; // intervalo do autoplay
const PAUSE_MS = 9000; // pausa apos o usuario interagir
const TICK_MS = 400;

let lastInteraction = 0;

function getParts() {
  const root = document.querySelector(".foto-carousel");
  if (!root) return null;
  const track = root.querySelector(".foto-carousel-track");
  const slides = [...root.querySelectorAll(".foto-carousel-slide")];
  const dotsBox = root.querySelector(".foto-carousel-dots");
  if (!track || slides.length === 0) return null;
  return { root, track, slides, dotsBox };
}

function currentIndex({ track, slides }) {
  const x = track.scrollLeft;
  let best = 0;
  let bestDist = Infinity;
  slides.forEach((slide, i) => {
    const dist = Math.abs(slide.offsetLeft - x);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

// Animacao propria em vez de scrollTo({behavior:'smooth'}): o re-render do
// runtime (contador a cada segundo) cancela a animacao nativa no meio.
let animId = 0;

function animateScroll(track, to, duration = 550) {
  const from = track.scrollLeft;
  if (Math.abs(to - from) < 1) return;
  // Pagina oculta: rAF nao dispara, entao vai direto ao destino.
  if (document.hidden) {
    track.scrollLeft = to;
    return;
  }
  const id = ++animId;
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const step = (now) => {
    if (id !== animId) return;
    const p = Math.min(1, (now - t0) / duration);
    track.scrollLeft = from + (to - from) * ease(p);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function goTo(index, smooth = true) {
  const parts = getParts();
  if (!parts) return;
  const n = parts.slides.length;
  const i = ((index % n) + n) % n;
  const target = parts.slides[i].offsetLeft;
  if (smooth) animateScroll(parts.track, target);
  else parts.track.scrollLeft = target;
}

function syncDots(parts) {
  const { slides, dotsBox } = parts;
  if (!dotsBox) return;
  if (dotsBox.children.length !== slides.length) {
    dotsBox.innerHTML = slides
      .map(
        (_, i) =>
          `<button type="button" class="foto-carousel-dot" data-carousel-dot="${i}" aria-label="Ir para a foto ${i + 1}"></button>`,
      )
      .join("");
  }
  const active = currentIndex(parts);
  [...dotsBox.children].forEach((dot, i) => dot.classList.toggle("is-active", i === active));
}

export function initCarousel() {
  if (!document.querySelector(".foto-carousel")) return;

  document.addEventListener("click", (event) => {
    const prev = event.target.closest(".foto-carousel-prev");
    const next = event.target.closest(".foto-carousel-next");
    const dot = event.target.closest("[data-carousel-dot]");
    if (!prev && !next && !dot) return;
    lastInteraction = Date.now();
    const parts = getParts();
    if (!parts) return;
    if (dot) {
      goTo(Number(dot.dataset.carouselDot));
    } else {
      goTo(currentIndex(parts) + (next ? 1 : -1));
    }
  });

  // Swipe/scroll manual tambem pausa o autoplay.
  for (const type of ["pointerdown", "wheel", "touchstart"]) {
    document.addEventListener(
      type,
      (event) => {
        if (event.target instanceof Element && event.target.closest(".foto-carousel"))
          lastInteraction = Date.now();
      },
      { passive: true },
    );
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let lastAdvance = Date.now();

  setInterval(() => {
    const parts = getParts();
    if (!parts) return;
    syncDots(parts);

    const now = Date.now();
    if (document.hidden || reduceMotion.matches) {
      lastAdvance = now;
      return;
    }
    if (now - lastInteraction < PAUSE_MS) {
      lastAdvance = now;
      return;
    }
    if (now - lastAdvance < AUTOPLAY_MS) return;
    lastAdvance = now;
    goTo(currentIndex(parts) + 1);
  }, TICK_MS);
}
