import * as THREE from "three";

const FRONT_IMAGE = new URL("../assets/camiseta-oficial-frente.png", import.meta.url).href;
const BACK_IMAGE = new URL("../assets/camiseta-oficial-costas.png", import.meta.url).href;
const AUTO_SPEED = 0.42;
const DRAG_SPEED = 0.009;
const CAMERA_PADDING = 1.22;
const TEXTURE_CONTENT_SCALE = 0.92;
const ALPHA_THRESHOLD = 8;
const SOURCE_PADDING = 2;

function findOpaqueBounds(image) {
  const scanCanvas = document.createElement("canvas");
  scanCanvas.width = image.width;
  scanCanvas.height = image.height;

  const scanContext = scanCanvas.getContext("2d");
  scanContext.drawImage(image, 0, 0);

  const pixels = scanContext.getImageData(0, 0, image.width, image.height).data;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = pixels[(y * image.width + x) * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) continue;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: image.width, height: image.height };
  }

  const x = Math.max(0, minX - SOURCE_PADDING);
  const y = Math.max(0, minY - SOURCE_PADDING);
  const right = Math.min(image.width, maxX + SOURCE_PADDING + 1);
  const bottom = Math.min(image.height, maxY + SOURCE_PADDING + 1);

  return { x, y, width: right - x, height: bottom - y };
}

function createContainedTexture(sourceTexture, targetAspect) {
  const image = sourceTexture.image;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round(canvas.width / targetAspect);

  const context = canvas.getContext("2d");
  const source = findOpaqueBounds(image);
  const maxWidth = canvas.width * TEXTURE_CONTENT_SCALE;
  const maxHeight = canvas.height * TEXTURE_CONTENT_SCALE;
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, source.x, source.y, source.width, source.height, x, y, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  sourceTexture.dispose();
  return texture;
}

function closestRotation(current, target) {
  const fullTurn = Math.PI * 2;
  let delta = (target - current) % fullTurn;
  if (delta > Math.PI) delta -= fullTurn;
  if (delta < -Math.PI) delta += fullTurn;
  return current + delta;
}

function showFallback(stage, controls) {
  stage.classList.add("is-fallback");
  controls?.classList.add("is-hidden");
}

export async function initShirt3d() {
  const stage = document.querySelector(".shirt3d-stage");
  const canvas = stage?.querySelector(".shirt3d-canvas");
  const loading = stage?.querySelector(".shirt3d-loading");
  const controls = document.querySelector(".shirt3d-controls");
  if (!stage || !canvas) return;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (error) {
    console.error("WebGL indisponivel para o visualizador da camiseta.", error);
    showFallback(stage, controls);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.05, 12);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x151515, 2.4));

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
  keyLight.position.set(-3.5, 5, 5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xf4c20d, 2.1);
  rimLight.position.set(4, 1, -4);
  scene.add(rimLight);

  const model = new THREE.Group();
  model.rotation.set(-0.06, -0.22, 0);
  scene.add(model);

  const shirtWidth = 5.1;
  const shirtHeight = 5.1;
  const shirtDepth = 0.18;
  const loader = new THREE.TextureLoader();

  try {
    const [frontSource, backSource] = await Promise.all([
      loader.loadAsync(FRONT_IMAGE),
      loader.loadAsync(BACK_IMAGE),
    ]);
    const targetAspect = shirtWidth / shirtHeight;
    const frontTexture = createContainedTexture(frontSource, targetAspect);
    const backTexture = createContainedTexture(backSource, targetAspect);

    for (const texture of [frontTexture, backTexture]) {
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }

    const faceGeometry = new THREE.PlaneGeometry(shirtWidth - 0.08, shirtHeight - 0.08);
    const front = new THREE.Mesh(
      faceGeometry,
      new THREE.MeshStandardMaterial({
        map: frontTexture,
        roughness: 0.86,
        metalness: 0,
        transparent: true,
        alphaTest: 0.03,
        side: THREE.FrontSide,
      }),
    );
    front.position.z = shirtDepth / 2 + 0.012;
    front.castShadow = true;
    model.add(front);

    const back = new THREE.Mesh(
      faceGeometry,
      new THREE.MeshStandardMaterial({
        map: backTexture,
        roughness: 0.86,
        metalness: 0,
        transparent: true,
        alphaTest: 0.03,
        side: THREE.FrontSide,
      }),
    );
    back.position.z = -(shirtDepth / 2 + 0.012);
    back.rotation.y = Math.PI;
    back.castShadow = true;
    model.add(back);

    loading?.setAttribute("hidden", "");
    stage.classList.add("is-ready");
  } catch (error) {
    console.error("Nao foi possivel carregar as imagens da camiseta.", error);
    renderer.dispose();
    showFallback(stage, controls);
    return;
  }

  let rotationY = -0.22;
  let targetRotation = null;
  let autoRotate = true;
  let dragging = false;
  let previousX = 0;
  let visible = true;

  function setView(view) {
    const frontButton = controls?.querySelector('[data-shirt-view="front"]');
    const backButton = controls?.querySelector('[data-shirt-view="back"]');
    const autoButton = controls?.querySelector('[data-shirt-view="auto"]');

    frontButton?.classList.toggle("is-active", view === "front");
    frontButton?.setAttribute("aria-pressed", String(view === "front"));
    backButton?.classList.toggle("is-active", view === "back");
    backButton?.setAttribute("aria-pressed", String(view === "back"));
    autoButton?.classList.toggle("is-active", autoRotate);
    autoButton?.setAttribute("aria-pressed", String(autoRotate));
  }

  function selectView(view) {
    if (view === "auto") {
      autoRotate = !autoRotate;
      targetRotation = null;
      setView(Math.cos(rotationY) >= 0 ? "front" : "back");
      return;
    }

    autoRotate = false;
    targetRotation = closestRotation(rotationY, view === "back" ? Math.PI : 0);
    setView(view);
  }

  controls?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-shirt-view]");
    if (button) selectView(button.dataset.shirtView);
  });

  stage.addEventListener("pointerdown", (event) => {
    dragging = true;
    previousX = event.clientX;
    autoRotate = false;
    targetRotation = null;
    stage.classList.add("is-dragging");
    stage.setPointerCapture(event.pointerId);
    setView(Math.cos(rotationY) >= 0 ? "front" : "back");
  });

  stage.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    rotationY += (event.clientX - previousX) * DRAG_SPEED;
    previousX = event.clientX;
  });

  function stopDragging(event) {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("is-dragging");
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    setView(Math.cos(rotationY) >= 0 ? "front" : "back");
  }

  stage.addEventListener("pointerup", stopDragging);
  stage.addEventListener("pointercancel", stopDragging);
  stage.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      autoRotate = false;
      targetRotation = null;
      rotationY += event.key === "ArrowLeft" ? -0.18 : 0.18;
      setView(Math.cos(rotationY) >= 0 ? "front" : "back");
    }
  });

  const fitCamera = () => {
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const fitHeight = (shirtHeight * CAMERA_PADDING) / (2 * Math.tan(verticalFov / 2));
    const fitWidth = (shirtWidth * CAMERA_PADDING) / (2 * Math.tan(horizontalFov / 2));

    camera.position.z = Math.max(fitHeight, fitWidth);
    camera.updateProjectionMatrix();
  };

  const resize = () => {
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    fitCamera();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  resize();

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  intersectionObserver.observe(stage);

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let previousTime = performance.now();

  function frame(now) {
    const delta = Math.min(0.05, (now - previousTime) / 1000);
    previousTime = now;

    if (targetRotation !== null) {
      rotationY += (targetRotation - rotationY) * Math.min(1, delta * 8);
      if (Math.abs(targetRotation - rotationY) < 0.002) {
        rotationY = targetRotation;
        targetRotation = null;
      }
    } else if (autoRotate && !reduceMotion.matches && visible && !document.hidden) {
      rotationY += AUTO_SPEED * delta;
    }

    model.rotation.y = rotationY;
    model.rotation.x += (-0.035 - model.rotation.x) * Math.min(1, delta * 4);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  setView("front");
  requestAnimationFrame(frame);
}
