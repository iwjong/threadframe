import * as THREE from "/vendor/three.module.js";

/**
 * FREN Frame Player — 2:1 magazine layout, color extraction, counter, arrows, random.
 */
(function () {
  const DURATION_MS = 7000;
  const CAPTION_DELAY_MS = 400;
  const PROGRESS_REVEAL_MS = 2500;
  const FINAL_SPLASH_DURATION_MS = 1400;
  const COLOR_SAMPLE_SIZE = 48;
  const VIDEO_COLOR_UPDATE_INTERVAL_MS = 1500;
  const LOADING_PROGRESS_MAX = 94;
  const LOADING_PROGRESS_TICK_MS = 120;
  const DEFAULT_PANEL_BG = "#f5f2ed";
  const DEFAULT_PANEL_TEXT = "#2c2a26";

  /* Contrast-aware palette pool for varied but readable panel combinations */
  const BACKGROUNDS = [
    { hex: "#ffb6c1", name: "Pink" },
    { hex: "#ff69b4", name: "Hot Pink" },
    { hex: "#ffd700", name: "Gold" },
    { hex: "#ffc857", name: "Marigold" },
    { hex: "#98fb98", name: "Mint" },
    { hex: "#e0ffff", name: "Cyan" },
    { hex: "#d9eefc", name: "Mist" },
    { hex: "#dda0dd", name: "Plum" },
    { hex: "#d7d2ff", name: "Lilac" },
    { hex: "#ff7f50", name: "Coral" },
    { hex: "#ffefd5", name: "Papaya" },
    { hex: "#ffd8c2", name: "Apricot" },
    { hex: "#1a1a2e", name: "Navy" },
    { hex: "#243b6b", name: "Harbor" },
    { hex: "#2d1b4e", name: "Violet" },
    { hex: "#165b63", name: "Petrol" },
    { hex: "#fff8dc", name: "Cornsilk" },
    { hex: "#7fffd4", name: "Aquamarine" },
    { hex: "#ffe4b5", name: "Moccasin" },
    { hex: "#f0e68c", name: "Khaki" },
    { hex: "#ff1493", name: "Deep Pink" },
    { hex: "#00ced1", name: "Turquoise" },
    { hex: "#ffeb3b", name: "Yellow" },
    { hex: "#9c27b0", name: "Purple" },
    { hex: "#4fc3f7", name: "Sky" },
    { hex: "#81c784", name: "Sage" },
    { hex: "#4b2142", name: "Merlot" },
    { hex: "#2d4a2f", name: "Moss" },
  ];
  const TEXT_COLORS = [
    { hex: "#2e8b57", name: "Green" },
    { hex: "#ffd700", name: "Yellow" },
    { hex: "#1a1a2e", name: "Navy" },
    { hex: "#ffffff", name: "White" },
    { hex: "#fffaf0", name: "Ivory" },
    { hex: "#f5fbff", name: "Ice" },
    { hex: "#4b0082", name: "Indigo" },
    { hex: "#dc143c", name: "Crimson" },
    { hex: "#ff4500", name: "Orange" },
    { hex: "#228b22", name: "Forest" },
    { hex: "#8b4513", name: "Brown" },
    { hex: "#000000", name: "Black" },
    { hex: "#111827", name: "Carbon" },
    { hex: "#153243", name: "Ink" },
    { hex: "#e91e63", name: "Magenta" },
    { hex: "#00bcd4", name: "Cyan" },
    { hex: "#795548", name: "Umber" },
    { hex: "#ff5722", name: "Deep Orange" },
    { hex: "#673ab7", name: "Deep Purple" },
    { hex: "#009688", name: "Teal" },
    { hex: "#cddc39", name: "Lime" },
    { hex: "#ff9800", name: "Amber" },
    { hex: "#f44336", name: "Red" },
    { hex: "#3f51b5", name: "Blue" },
    { hex: "#5b1a18", name: "Oxblood" },
    { hex: "#0f5132", name: "Pine" },
  ];
  const PANEL_PATTERNS = [
    { name: "grid", size: 26, opacity: 0.08, colorAlpha: 0.075 },
    { name: "dots", size: 24, opacity: 0.12, colorAlpha: 0.085 },
    { name: "diagonal", size: 30, opacity: 0.07, colorAlpha: 0.07 },
    { name: "cross", size: 28, opacity: 0.06, colorAlpha: 0.06 },
  ];

  let posts = [];
  let nextCursor = null;
  let index = 0;
  let progressInterval = null;
  let advanceTimeout = null;
  let currentVideo = null;
  let soundOn = false;
  let randomMode = false;
  let loadingMore = false;
  let colorUpdateInterval = null;
  let lastAppliedColors = null;
  let hideProgressTimeout = null;
  let displayedPostId = null;
  let nextLoadId = 0;
  let loadingProgressValue = 0;
  let loadingProgressTarget = 0;
  let loadingProgressInterval = null;
  let currentPanelPatternSeed = "threadframe";
  let media3DStage = null;
  try {
    soundOn = sessionStorage.getItem("frameSoundOn") === "1";
    randomMode = sessionStorage.getItem("frameRandomMode") === "1";
  } catch (_) {}

  const el = {
    container: document.querySelector(".frame-container"),
    panelMedia: document.querySelector(".panel-media"),
    mediaStage: document.querySelector(".media-stage"),
    media3DLayer: document.querySelector(".media-3d-layer"),
    mediaWrap: document.querySelector(".media-wrap"),
    mediaPreload: document.querySelector(".media-preload"),
    panelTypography: document.querySelector(".panel-typography"),
    panelBody: document.querySelector(".panel-body"),
    captionWrap: document.querySelector(".caption-wrap"),
    captionText: document.querySelector(".caption-wrap .text"),
    counter: document.querySelector(".counter"),
    navPrev: document.querySelector(".nav-arrow.prev"),
    navNext: document.querySelector(".nav-arrow.next"),
    soundToggle: document.querySelector(".sound-toggle"),
    randomToggle: document.querySelector(".random-toggle"),
    postMeta: document.getElementById("post-meta"),
    loading: document.querySelector(".loading"),
    loadingStatus: document.getElementById("loading-status"),
    loadingDetail: document.getElementById("loading-detail"),
    loadingThreadId: document.getElementById("loading-thread-id"),
    loadingProgressFill: document.getElementById("loading-progress-fill"),
    loadingProgressValue: document.getElementById("loading-progress-value"),
    splash: document.querySelector(".splash"),
    splashSlides: document.querySelectorAll(".splash-slide"),
    reconnect: document.querySelector(".reconnect"),
    reconnectMessage: document.getElementById("reconnect-message"),
    mediaProgress: document.querySelector(".media-progress"),
    mediaProgressFill: document.querySelector(".media-progress-fill"),
    mediaTimeCurrent: document.querySelector(".media-time-current"),
    mediaTimeTotal: document.querySelector(".media-time-total"),
  };

  function parseColor(color) {
    if (typeof color !== "string") return null;
    const value = color.trim();
    let match = value.match(/^#([0-9a-f]{3})$/i);
    if (match) {
      const [r, g, b] = match[1].split("").map((part) => parseInt(part + part, 16));
      return { r, g, b };
    }
    match = value.match(/^#([0-9a-f]{6})$/i);
    if (match) {
      return {
        r: parseInt(match[1].slice(0, 2), 16),
        g: parseInt(match[1].slice(2, 4), 16),
        b: parseInt(match[1].slice(4, 6), 16),
      };
    }
    match = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i);
    if (match) {
      return {
        r: Math.max(0, Math.min(255, Number(match[1]))),
        g: Math.max(0, Math.min(255, Number(match[2]))),
        b: Math.max(0, Math.min(255, Number(match[3]))),
      };
    }
    return null;
  }

  function withAlpha(color, alpha, fallback) {
    const rgb = parseColor(color);
    if (!rgb) return fallback;
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  }

  function rgbToCss(rgb, fallback) {
    if (!rgb) return fallback || "";
    return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  }

  function rgbaFromRgb(rgb, alpha, fallback) {
    if (!rgb) return fallback || "";
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  }

  function mixRgb(a, b, amount) {
    if (!a || !b) return a || b || null;
    const weight = Math.max(0, Math.min(1, amount));
    return {
      r: Math.round(a.r + (b.r - a.r) * weight),
      g: Math.round(a.g + (b.g - a.g) * weight),
      b: Math.round(a.b + (b.b - a.b) * weight),
    };
  }

  function relativeLuminance(color) {
    const rgb = typeof color === "string" ? parseColor(color) : color;
    if (!rgb) return 0;
    const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
      const normalized = value / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(bgColor, textColor) {
    const bgLuma = relativeLuminance(bgColor);
    const textLuma = relativeLuminance(textColor);
    const lighter = Math.max(bgLuma, textLuma);
    const darker = Math.min(bgLuma, textLuma);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function pickContrastText(bgColor, seed) {
    const scored = TEXT_COLORS.map((color) => ({
      ...color,
      contrast: contrastRatio(bgColor, color.hex),
    })).sort((a, b) => b.contrast - a.contrast);
    let candidates = scored.filter((color) => color.contrast >= 4.5);
    if (candidates.length === 0) candidates = scored.filter((color) => color.contrast >= 3.6);
    if (candidates.length === 0) candidates = scored.slice(0, Math.min(4, scored.length));
    const pool = candidates.slice(0, Math.min(4, candidates.length));
    return pool[hashString(seed) % pool.length] || { hex: DEFAULT_PANEL_TEXT };
  }

  function createPaletteFromBackground(bgColor, seed, accentSource) {
    const bgRgb = parseColor(bgColor) || parseColor(DEFAULT_PANEL_BG);
    const textChoice = pickContrastText(bgColor, seed);
    const textRgb = parseColor(textChoice.hex) || parseColor(DEFAULT_PANEL_TEXT);
    const accentRgb = mixRgb(accentSource || bgRgb, textRgb, 0.18);
    return {
      bg: rgbToCss(bgRgb, DEFAULT_PANEL_BG),
      text: textChoice.hex,
      accent: rgbaFromRgb(accentRgb, 0.2, "rgba(44,42,38,0.2)"),
      divider: withAlpha(textChoice.hex, 0.2, "rgba(44,42,38,0.2)"),
    };
  }

  function hashString(value) {
    const input = String(value || "threadframe");
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function setPanelPattern(seed, textColor) {
    if (!el.panelTypography || PANEL_PATTERNS.length === 0) return;
    const preset = PANEL_PATTERNS[hashString(seed) % PANEL_PATTERNS.length];
    el.panelTypography.dataset.pattern = preset.name;
    el.panelTypography.style.setProperty("--panel-pattern-size", preset.size + "px");
    el.panelTypography.style.setProperty("--panel-pattern-opacity", String(preset.opacity));
    el.panelTypography.style.setProperty(
      "--panel-pattern-color",
      withAlpha(textColor, preset.colorAlpha, `rgba(44,42,38,${preset.colorAlpha})`)
    );
  }

  function setPanelPatternForPost(post) {
    currentPanelPatternSeed =
      (post && (post.id || post.permalink || post.timestamp || post.media_url)) || "threadframe";
    setPanelPattern(currentPanelPatternSeed, lastAppliedColors?.text || DEFAULT_PANEL_TEXT);
  }

  function createDisabledMedia3DStage() {
    return {
      enabled: false,
      clear() {
        el.mediaWrap?.classList.remove("media-wrap-3d-active");
        el.media3DLayer?.classList.remove("media-3d-visible");
      },
      resize() {},
      setSource() {
        this.clear();
      },
      syncPalette() {},
    };
  }

  function fitTextureToSquare(texture, width, height) {
    if (!texture || !width || !height) return;
    const aspect = width / height;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.center.set(0.5, 0.5);
    texture.offset.set(0, 0);
    texture.repeat.set(1, 1);
    if (aspect > 1) {
      const repeatX = 1 / aspect;
      texture.repeat.set(repeatX, 1);
      texture.offset.set((1 - repeatX) / 2, 0);
    } else if (aspect < 1) {
      const repeatY = aspect;
      texture.repeat.set(1, repeatY);
      texture.offset.set(0, (1 - repeatY) / 2);
    }
  }

  function drawGlassTextureCanvas(canvas, side) {
    if (!canvas) return;
    const size = canvas.width || 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isRight = side === "right";
    const startX = isRight ? size : 0;
    const endX = isRight ? size * 0.48 : size * 0.52;
    const shimmerStartX = isRight ? size * 0.84 : size * 0.16;
    const shimmerEndX = isRight ? size * 0.56 : size * 0.44;
    const radialX = isRight ? size * 0.9 : size * 0.1;

    ctx.clearRect(0, 0, size, size);

    const sweep = ctx.createLinearGradient(startX, size, endX, size * 0.24);
    sweep.addColorStop(0, "rgba(255,255,255,0.05)");
    sweep.addColorStop(0.12, "rgba(255,255,255,0.018)");
    sweep.addColorStop(0.28, "rgba(255,255,255,0.006)");
    sweep.addColorStop(0.46, "rgba(255,255,255,0)");
    sweep.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, size, size);

    const cornerBloom = ctx.createRadialGradient(radialX, size * 0.92, 0, radialX, size * 0.92, size * 0.46);
    cornerBloom.addColorStop(0, "rgba(255,255,255,0.04)");
    cornerBloom.addColorStop(0.18, "rgba(255,255,255,0.015)");
    cornerBloom.addColorStop(0.42, "rgba(255,255,255,0.004)");
    cornerBloom.addColorStop(0.72, "rgba(255,255,255,0)");
    ctx.fillStyle = cornerBloom;
    ctx.fillRect(0, 0, size, size);

    const band = ctx.createLinearGradient(shimmerStartX, size, shimmerEndX, size * 0.16);
    band.addColorStop(0, "rgba(255,255,255,0)");
    band.addColorStop(0.28, "rgba(255,255,255,0.024)");
    band.addColorStop(0.44, "rgba(255,255,255,0.008)");
    band.addColorStop(0.62, "rgba(255,255,255,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, size, size);

    ctx.lineCap = "round";
    for (let i = 0; i < 22; i++) {
      const x = isRight
        ? size - (((i * 71) % Math.round(size * 0.34)) + 8)
        : ((i * 71) % Math.round(size * 0.34)) + 8;
      const y = size * 0.54 + ((i * 37) % Math.round(size * 0.42));
      const dx = isRight ? -14 - (i % 4) * 8 : 14 + (i % 4) * 8;
      const dy = -70 - (i % 5) * 18;
      ctx.strokeStyle = `rgba(255,255,255,${i % 5 === 0 ? 0.012 : 0.005})`;
      ctx.lineWidth = i % 6 === 0 ? 0.9 : 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    }

    for (let i = 0; i < 38; i++) {
      const x = isRight
        ? size - ((i * 43) % Math.round(size * 0.38))
        : (i * 43) % Math.round(size * 0.38);
      const y = size * 0.58 + ((i * 89) % Math.round(size * 0.34));
      const radius = i % 7 === 0 ? 1.4 : 0.8;
      ctx.fillStyle = `rgba(255,255,255,${i % 8 === 0 ? 0.014 : 0.006})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function createGlassTextureCanvas(side) {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    drawGlassTextureCanvas(canvas, side);
    return canvas;
  }

  function createMedia3DStage() {
    if (!el.mediaStage || !el.media3DLayer || typeof window === "undefined" || typeof window.WebGLRenderingContext === "undefined") {
      return createDisabledMedia3DStage();
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch (_) {
      return createDisabledMedia3DStage();
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = "media-3d-canvas";

    el.media3DLayer.textContent = "";
    el.media3DLayer.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 12);
    camera.position.set(0, 0, 3.35);

    const stageGroup = new THREE.Group();
    stageGroup.position.set(0, 0, 0.03);
    stageGroup.rotation.set(0, 0, 0);
    stageGroup.visible = false;
    scene.add(stageGroup);

    const frontMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x121215,
      roughness: 0.82,
      metalness: 0.16,
    });
    const backMaterial = new THREE.MeshStandardMaterial({
      color: 0x08090b,
      roughness: 0.9,
      metalness: 0.1,
    });

    const coverMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.58, 1.58, 0.028),
      [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, frontMaterial, backMaterial]
    );
    coverMesh.castShadow = true;
    coverMesh.receiveShadow = false;
    stageGroup.add(coverMesh);

    const glassSide = "right";
    const glassTexture = new THREE.CanvasTexture(createGlassTextureCanvas(glassSide));
    glassTexture.colorSpace = THREE.SRGBColorSpace;
    glassTexture.generateMipmaps = false;
    glassTexture.minFilter = THREE.LinearFilter;
    glassTexture.magFilter = THREE.LinearFilter;

    const glassOverlay = new THREE.Mesh(
      new THREE.PlaneGeometry(1.56, 1.56),
      new THREE.MeshBasicMaterial({
        map: glassTexture,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
      })
    );
    glassOverlay.position.z = 0.016;
    glassOverlay.visible = false;
    stageGroup.add(glassOverlay);

    const coverShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.25, 2.25),
      new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.24 })
    );
    coverShadow.position.z = -0.18;
    coverShadow.receiveShadow = true;
    coverShadow.visible = false;
    scene.add(coverShadow);

    const glowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 2.1),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
      })
    );
    glowPlane.position.z = -0.28;
    glowPlane.visible = false;
    scene.add(glowPlane);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.7);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(1.2, 1.8, 3.1);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0008;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 10;
    keyLight.shadow.camera.left = -2;
    keyLight.shadow.camera.right = 2;
    keyLight.shadow.camera.top = 2;
    keyLight.shadow.camera.bottom = -2;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const fillLight = new THREE.DirectionalLight(0xbfd3ff, 0.36);
    fillLight.position.set(-1.8, -0.8, 2.4);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xfff2db, 0.42, 8);
    rimLight.position.set(-0.9, 1.05, 1.8);
    scene.add(rimLight);

    let currentTexture = null;
    let currentSourceIsVideo = false;
    let renderRaf = 0;
    let continuousRender = false;
    let sourceToken = 0;

    function hideStage() {
      el.mediaWrap?.classList.remove("media-wrap-3d-active");
      el.media3DLayer?.classList.remove("media-3d-visible");
      stageGroup.visible = false;
      glassOverlay.visible = false;
      coverShadow.visible = false;
      glowPlane.visible = false;
    }

    function showStage() {
      el.mediaWrap?.classList.add("media-wrap-3d-active");
      el.media3DLayer?.classList.add("media-3d-visible");
      stageGroup.visible = true;
      glassOverlay.visible = true;
      coverShadow.visible = true;
      glowPlane.visible = true;
    }

    function stopRenderLoop() {
      continuousRender = false;
      if (renderRaf) {
        cancelAnimationFrame(renderRaf);
        renderRaf = 0;
      }
    }

    function renderFrame() {
      renderRaf = 0;
      renderer.render(scene, camera);
      if (continuousRender) {
        renderRaf = requestAnimationFrame(renderFrame);
      }
    }

    function requestRender(continuous) {
      if (!continuous && continuousRender && renderRaf) {
        cancelAnimationFrame(renderRaf);
        renderRaf = 0;
      }
      continuousRender = Boolean(continuous);
      if (!renderRaf) {
        renderRaf = requestAnimationFrame(renderFrame);
      }
    }

    function disposeTexture() {
      if (currentTexture) {
        currentTexture.dispose();
        currentTexture = null;
      }
      frontMaterial.map = null;
      frontMaterial.needsUpdate = true;
    }

    function resize() {
      const rect = el.media3DLayer.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      requestRender(currentSourceIsVideo);
    }

    function syncPalette(palette) {
      const bgRgb = parseColor(palette?.bg || DEFAULT_PANEL_BG) || parseColor(DEFAULT_PANEL_BG);
      const textRgb = parseColor(palette?.text || DEFAULT_PANEL_TEXT) || parseColor(DEFAULT_PANEL_TEXT);
      const edgeRgb = mixRgb(bgRgb, { r: 8, g: 8, b: 10 }, 0.84);
      const backRgb = mixRgb(edgeRgb, textRgb, 0.12);
      const glowRgb = mixRgb(bgRgb, { r: 255, g: 255, b: 255 }, 0.18);
      edgeMaterial.color.set(rgbToCss(edgeRgb, "#121215"));
      backMaterial.color.set(rgbToCss(backRgb, "#08090b"));
      fillLight.color.set(rgbToCss(mixRgb(bgRgb, textRgb, 0.22), "#9db6ff"));
      glowPlane.material.color.set(rgbToCss(glowRgb, "#ffffff"));
      glowPlane.material.opacity = relativeLuminance(bgRgb) > 0.35 ? 0.035 : 0.055;
      glassOverlay.material.opacity = relativeLuminance(bgRgb) > 0.35 ? 0.022 : 0.032;
      requestRender(currentSourceIsVideo);
    }

    function applyTextureFromSource(source, token) {
      if (token !== sourceToken || !source) return;
      const sourceIsVideo = source.tagName === "VIDEO";
      const texture = sourceIsVideo ? new THREE.VideoTexture(source) : new THREE.Texture(source);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy?.() || 1);

      const width = sourceIsVideo ? source.videoWidth : source.naturalWidth;
      const height = sourceIsVideo ? source.videoHeight : source.naturalHeight;
      fitTextureToSquare(texture, width, height);
      texture.needsUpdate = true;

      disposeTexture();
      currentTexture = texture;
      currentSourceIsVideo = sourceIsVideo;
      frontMaterial.map = texture;
      frontMaterial.needsUpdate = true;
      showStage();
      requestRender(sourceIsVideo);
    }

    function setSource(source) {
      sourceToken += 1;
      const token = sourceToken;
      hideStage();
      stopRenderLoop();
      disposeTexture();
      if (!source) {
        renderer.clear();
        return;
      }

      const sourceIsVideo = source.tagName === "VIDEO";
      currentSourceIsVideo = sourceIsVideo;
      if (sourceIsVideo) {
        let settled = false;
        const ready = () => {
          if (settled) return;
          settled = true;
          applyTextureFromSource(source, token);
        };
        if (source.readyState >= 2 && source.videoWidth && source.videoHeight) {
          ready();
        } else {
          source.addEventListener("loadeddata", ready, { once: true });
          source.addEventListener("canplay", ready, { once: true });
        }
        return;
      }

      const ready = () => applyTextureFromSource(source, token);
      if (source.complete && source.naturalWidth && source.naturalHeight) {
        ready();
      } else {
        source.addEventListener("load", ready, { once: true });
      }
    }

    const resizeObserver =
      typeof window.ResizeObserver === "function"
        ? new ResizeObserver(() => resize())
        : null;
    resizeObserver?.observe(el.media3DLayer);

    resize();
    syncPalette({ bg: DEFAULT_PANEL_BG, text: DEFAULT_PANEL_TEXT });

    return {
      enabled: true,
      clear() {
        sourceToken += 1;
        stopRenderLoop();
        currentSourceIsVideo = false;
        hideStage();
        disposeTexture();
        renderer.clear();
      },
      resize,
      setSource,
      syncPalette,
    };
  }

  function updateSoundButton() {
    if (!el.soundToggle) return;
    el.soundToggle.classList.toggle("muted", !soundOn);
    el.soundToggle.classList.toggle("unmuted", soundOn);
    el.soundToggle.setAttribute("aria-label", soundOn ? "Mute video" : "Unmute video");
    el.soundToggle.title = soundOn ? "Mute" : "Unmute";
    try { sessionStorage.setItem("frameSoundOn", soundOn ? "1" : "0"); } catch (_) {}
  }

  function updateRandomButton() {
    if (!el.randomToggle) return;
    el.randomToggle.classList.toggle("active", randomMode);
    el.randomToggle.title = randomMode ? "Random on" : "Random off";
    try { sessionStorage.setItem("frameRandomMode", randomMode ? "1" : "0"); } catch (_) {}
  }

  function updateCounter() {
    if (!el.counter) return;
    const total = posts.length;
    const current = total ? index + 1 : 0;
    const digits = Math.max(2, String(Math.max(total, 0)).length);
    const currentLabel = String(current).padStart(digits, "0");
    const totalLabel = String(total).padStart(digits, "0");
    el.counter.textContent = currentLabel + " / " + totalLabel;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function updateMediaProgress(currentSeconds, totalSeconds) {
    if (!el.mediaProgressFill || !el.mediaTimeCurrent || !el.mediaTimeTotal) return;
    const total = totalSeconds > 0 ? totalSeconds : 1;
    const pct = Math.min(100, (currentSeconds / total) * 100);
    el.mediaProgressFill.style.width = pct + "%";
    el.mediaTimeCurrent.textContent = formatTime(currentSeconds);
    el.mediaTimeTotal.textContent = formatTime(totalSeconds);
  }

  function showMediaProgress(show) {
    if (!el.mediaProgress) return;
    el.mediaProgress.classList.toggle("visible", !!show);
    if (!show) {
      el.mediaProgress.classList.remove("revealed");
      if (hideProgressTimeout) { clearTimeout(hideProgressTimeout); hideProgressTimeout = null; }
    }
  }

  function revealProgressTemporarily() {
    if (!el.mediaProgress || !el.mediaProgress.classList.contains("visible")) return;
    el.mediaProgress.classList.add("revealed");
    if (hideProgressTimeout) clearTimeout(hideProgressTimeout);
    hideProgressTimeout = setTimeout(() => {
      el.mediaProgress?.classList.remove("revealed");
      hideProgressTimeout = null;
    }, PROGRESS_REVEAL_MS);
  }

  const CAPTION_FONT_MIN = 15;
  const CAPTION_FONT_MAX = 34;
  const CAPTION_FONT_STEP = 2;

  function getCaptionMetrics() {
    const density = el.captionText?.dataset.density || "medium";
    if (density === "short") {
      return { min: 22, max: 44, step: 2, lineHeight: 1.24 };
    }
    if (density === "long") {
      return { min: 14, max: 28, step: 1, lineHeight: 1.64 };
    }
    return { min: 16, max: 33, step: 2, lineHeight: 1.56 };
  }

  function renderCaptionText(text) {
    if (!el.captionText) return;
    const raw = typeof text === "string" ? text : "";
    const normalized = raw.replace(/\r\n?/g, "\n").trim();
    el.captionText.textContent = "";

    if (!normalized) {
      el.captionText.dataset.density = "empty";
      if (el.captionWrap) el.captionWrap.dataset.density = "empty";
      el.captionText.textContent = "\u00A0";
      return;
    }

    const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const charCount = normalized.replace(/\s+/g, " ").trim().length;
    const density =
      charCount <= 60 && paragraphs.length <= 1
        ? "short"
        : charCount <= 180 && paragraphs.length <= 2
          ? "medium"
          : "long";

    el.captionText.dataset.density = density;
    if (el.captionWrap) el.captionWrap.dataset.density = density;
    for (const paragraphText of paragraphs) {
      const paragraph = document.createElement("p");
      paragraph.textContent = paragraphText;
      el.captionText.appendChild(paragraph);
    }
  }

  function fitCaptionFont() {
    if (!el.captionText || !el.panelBody) return;
    const container = el.captionWrap || el.panelBody;
    const textEl = el.captionText;
    const metrics = getCaptionMetrics();
    const lineHeight = metrics.lineHeight;
    const maxHeight = Math.max(0, container.clientHeight - 28);
    if (maxHeight <= 0) return;
    textEl.style.lineHeight = lineHeight;
    let size = metrics.min;
    textEl.style.fontSize = size + "px";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 1) Prefer no word break: don't exceed width (no horizontal overflow)
        // 2) Then use as much height as possible
        while (size < metrics.max) {
          const nextSize = size + metrics.step;
          textEl.style.fontSize = nextSize + "px";
          const overWidth = textEl.scrollWidth > textEl.clientWidth;
          const overHeight = textEl.scrollHeight > maxHeight;
          if (overWidth || overHeight) {
            textEl.style.fontSize = size + "px";
            break;
          }
          size = nextSize;
        }
      });
    });
  }

  function showLoading(show) {
    if (el.loading) el.loading.style.display = show ? "flex" : "none";
    if (!show) stopLoadingProgress();
  }
  function updateLoadingStatus(text) {
    if (el.loadingStatus) el.loadingStatus.textContent = text;
  }
  function updateLoadingDetail(text) {
    if (el.loadingDetail) el.loadingDetail.textContent = text || "";
  }
  function renderLoadingProgress(value) {
    const safeValue = Math.max(0, Math.min(100, value));
    if (el.loadingProgressFill) el.loadingProgressFill.style.width = safeValue + "%";
    if (el.loadingProgressValue) el.loadingProgressValue.textContent = Math.round(safeValue) + "%";
  }
  function stopLoadingProgress() {
    if (loadingProgressInterval) {
      clearInterval(loadingProgressInterval);
      loadingProgressInterval = null;
    }
  }
  function startLoadingProgress() {
    stopLoadingProgress();
    loadingProgressValue = 0;
    loadingProgressTarget = 12;
    renderLoadingProgress(loadingProgressValue);
    loadingProgressInterval = setInterval(() => {
      if (loadingProgressTarget < LOADING_PROGRESS_MAX) {
        loadingProgressTarget = Math.min(
          LOADING_PROGRESS_MAX,
          loadingProgressTarget + Math.max(0.18, (LOADING_PROGRESS_MAX - loadingProgressTarget) * 0.015)
        );
      }
      if (loadingProgressValue >= loadingProgressTarget) return;
      loadingProgressValue = Math.min(
        loadingProgressTarget,
        loadingProgressValue + Math.max(0.35, (loadingProgressTarget - loadingProgressValue) * 0.22)
      );
      renderLoadingProgress(loadingProgressValue);
    }, LOADING_PROGRESS_TICK_MS);
  }
  function bumpLoadingProgress(target) {
    loadingProgressTarget = Math.max(loadingProgressTarget, Math.min(LOADING_PROGRESS_MAX, target));
  }
  function finishLoadingProgress() {
    if (!el.loadingProgressFill || !el.loadingProgressValue) return Promise.resolve();
    loadingProgressTarget = 100;
    return new Promise((resolve) => {
      const finishCheck = setInterval(() => {
        if (loadingProgressValue >= 99.5) {
          loadingProgressValue = 100;
          renderLoadingProgress(loadingProgressValue);
          clearInterval(finishCheck);
          stopLoadingProgress();
          resolve();
        }
      }, 40);
    });
  }
  function showSplash(show) {
    if (!el.splash) return;
    el.splash.style.display = show ? "flex" : "none";
    if (show && el.splashSlides.length) {
      el.splashSlides.forEach((s, i) => s.classList.toggle("splash-slide-active", i === 0));
    }
  }
  function runLaunchSplashThenShowPost(done, waitFor) {
    Promise.all([
      new Promise((resolve) => setTimeout(resolve, FINAL_SPLASH_DURATION_MS)),
      waitFor ? waitFor : Promise.resolve(),
    ]).then(() => {
      showSplash(false);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (done) done();
      }));
    });
  }
  function applyRandomPalette() {
    if (!el.panelTypography || BACKGROUNDS.length === 0 || TEXT_COLORS.length === 0) return;
    const bg = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
    const palette = createPaletteFromBackground(bg.hex, currentPanelPatternSeed + "-random", parseColor(bg.hex));
    const textChoice = pickContrastText(bg.hex, currentPanelPatternSeed + "-random");
    applyPalette({
      ...palette,
      codeBg: bg.name,
      codeText: textChoice.name,
    });
  }
  function showReconnect(show, message) {
    if (!el.reconnect) return;
    el.reconnect.style.display = show ? "flex" : "none";
    if (el.reconnectMessage) el.reconnectMessage.textContent = message || "";
  }

  function clearTimers() {
    if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
    if (advanceTimeout) { clearTimeout(advanceTimeout); advanceTimeout = null; }
    if (hideProgressTimeout) { clearTimeout(hideProgressTimeout); hideProgressTimeout = null; }
    clearColorUpdateInterval();
    el.mediaProgress?.classList.remove("revealed");
    if (currentVideo) {
      try { currentVideo.removeEventListener("ended", onVideoEnded); } catch (_) {}
      currentVideo = null;
    }
  }

  function isVideo(post) {
    return (post.media_type || "").toUpperCase() === "VIDEO";
  }
  function getMediaUrl(post) {
    return post.media_url || post.thumbnail_url || "";
  }
  function getVideoPoster(post) {
    return post.thumbnail_url || "";
  }

  const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function formatPostDate(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      const y = d.getFullYear();
      const monthIdx = d.getMonth();
      const day = d.getDate();
      const mon = MONTH_ABBR[monthIdx] ?? String(monthIdx + 1);
      return `${mon} ${day}, ${y}`;
    } catch (_) {
      return "";
    }
  }

  function formatMetric(value) {
    if (value == null || Number.isNaN(Number(value))) return "-";
    try {
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(Number(value));
    } catch (_) {
      return String(value);
    }
  }

  function createMetaItem(label, value, modifier) {
    const item = document.createElement("span");
    item.className = "post-meta-item" + (modifier ? " " + modifier : "");

    const labelEl = document.createElement("span");
    labelEl.className = "post-meta-label";
    labelEl.textContent = label;

    const valueEl = document.createElement("span");
    valueEl.className = "post-meta-value";
    valueEl.textContent = value;

    item.appendChild(labelEl);
    item.appendChild(valueEl);
    return item;
  }

  function renderPostMeta(dateStr, likesValue) {
    if (!el.postMeta) return;
    el.postMeta.textContent = "";
    if (dateStr) el.postMeta.appendChild(createMetaItem("Posted", dateStr, "post-meta-date"));
    el.postMeta.appendChild(createMetaItem("Likes", likesValue == null ? "-" : formatMetric(likesValue), "post-meta-likes"));
  }

  function updatePostMeta(post) {
    if (!el.postMeta) return;
    const dateStr = formatPostDate(post.timestamp);
    const id = post.id;
    displayedPostId = id;
    renderPostMeta(dateStr, null);
    if (!id) return;
    fetch("/api/insights?id=" + encodeURIComponent(id))
      .then((res) => res.json())
      .then((data) => {
        if (displayedPostId !== id) return;
        const likes = data.likes != null ? Number(data.likes) : null;
        renderPostMeta(dateStr, likes);
      })
      .catch(() => {});
  }

  function getDominantColorFromPixels(data) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 128) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
    if (n === 0) return null;
    return {
      r: Math.round(r / n),
      g: Math.round(g / n),
      b: Math.round(b / n),
    };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        default: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r*255), g: Math.round(g*255), b: Math.round(b*255) };
  }
  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  }

  function pantoneLike(rgb) {
    let { r, g, b } = rgb;
    const hsl = rgbToHsl(r, g, b);
    const seed = hashString(`${currentPanelPatternSeed}-${r}-${g}-${b}`);
    const hueShift = [0, -18, 14, 26][seed % 4];
    const shiftedHue = (hsl.h + hueShift + 360) % 360;
    const prefersLightPanel = hsl.l > 58 || seed % 5 === 0;

    let bgRgb;
    if (prefersLightPanel) {
      const softTone = hslToRgb(
        shiftedHue,
        Math.max(12, Math.min(38, hsl.s * 0.42)),
        Math.max(80, Math.min(92, 88 - hsl.s * 0.05))
      );
      bgRgb = mixRgb(softTone, { r: 255, g: 249, b: 242 }, 0.32);
    } else {
      const deepTone = hslToRgb(
        shiftedHue,
        Math.max(18, Math.min(52, hsl.s * 0.58)),
        Math.max(18, Math.min(30, 17 + hsl.l * 0.14))
      );
      bgRgb = mixRgb(deepTone, { r: 14, g: 16, b: 20 }, 0.22);
    }

    return createPaletteFromBackground(rgbToCss(bgRgb, DEFAULT_PANEL_BG), `${currentPanelPatternSeed}-source`, rgb);
  }

  function applyPalette(palette) {
    if (!el.panelTypography || !palette) return;
    lastAppliedColors = palette;
    if (el.container) {
      el.container.style.setProperty("--panel-bg", palette.bg);
      el.container.style.setProperty("--panel-text", palette.text);
      el.container.style.setProperty(
        "--panel-accent",
        palette.accent || withAlpha(palette.text, 0.14, "rgba(44,42,38,0.14)")
      );
      el.container.style.setProperty(
        "--panel-divider",
        palette.divider || withAlpha(palette.text, 0.18, "rgba(44,42,38,0.18)")
      );
    }
    el.panelTypography.style.setProperty("--panel-bg", palette.bg);
    el.panelTypography.style.setProperty("--panel-text", palette.text);
    el.panelTypography.style.setProperty(
      "--panel-accent",
      palette.accent || withAlpha(palette.text, 0.14, "rgba(44,42,38,0.14)")
    );
    el.panelTypography.style.setProperty(
      "--panel-divider",
      palette.divider || withAlpha(palette.text, 0.18, "rgba(44,42,38,0.18)")
    );
    setPanelPattern(currentPanelPatternSeed, palette.text || DEFAULT_PANEL_TEXT);
    if (el.container) el.container.style.setProperty("--ui-text", palette.text);
    media3DStage?.syncPalette(palette);
  }

  function resetPanelColors() {
    if (!el.panelTypography) return;
    if (el.container) {
      el.container.style.setProperty("--panel-bg", DEFAULT_PANEL_BG);
      el.container.style.setProperty("--panel-text", DEFAULT_PANEL_TEXT);
      el.container.style.setProperty("--panel-accent", "rgba(44,42,38,0.14)");
      el.container.style.setProperty("--panel-divider", "rgba(44,42,38,0.18)");
    }
    el.panelTypography.style.setProperty("--panel-bg", DEFAULT_PANEL_BG);
    el.panelTypography.style.setProperty("--panel-text", DEFAULT_PANEL_TEXT);
    el.panelTypography.style.setProperty("--panel-accent", "rgba(44,42,38,0.14)");
    el.panelTypography.style.setProperty("--panel-divider", "rgba(44,42,38,0.18)");
    setPanelPattern(currentPanelPatternSeed, DEFAULT_PANEL_TEXT);
    if (el.container) el.container.style.setProperty("--ui-text", DEFAULT_PANEL_TEXT);
    lastAppliedColors = null;
    if (el.postMeta) el.postMeta.textContent = "";
    media3DStage?.syncPalette({ bg: DEFAULT_PANEL_BG, text: DEFAULT_PANEL_TEXT });
  }

  function applyColorsFromSource(source, isVideo) {
    if (!el.panelTypography) return;
    const canvas = document.createElement("canvas");
    const size = COLOR_SAMPLE_SIZE;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function sample() {
      try {
        ctx.drawImage(source, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const rgb = getDominantColorFromPixels(data);
        if (!rgb) {
          if (lastAppliedColors) applyPalette(lastAppliedColors);
          return;
        }
        const palette = pantoneLike(rgb);
        applyPalette(palette);
      } catch (_) {
        if (lastAppliedColors) applyPalette(lastAppliedColors);
        else resetPanelColors();
      }
    }

    if (isVideo) {
      source.addEventListener("loadeddata", () => {
        sample();
        if (colorUpdateInterval) clearInterval(colorUpdateInterval);
        colorUpdateInterval = setInterval(sample, VIDEO_COLOR_UPDATE_INTERVAL_MS);
      }, { once: true });
      if (source.readyState >= 2) sample();
    } else {
      if (source.complete && source.naturalWidth) sample();
      else source.addEventListener("load", () => sample());
    }
  }

  function clearColorUpdateInterval() {
    if (colorUpdateInterval) {
      clearInterval(colorUpdateInterval);
      colorUpdateInterval = null;
    }
  }

  media3DStage = createMedia3DStage();

  function showPost() {
    if (posts.length === 0) return;
    const post = posts[index];
    const url = getMediaUrl(post);
    if (!url) {
      next();
      return;
    }

    const isVid = isVideo(post);
    const hadContent = el.mediaWrap && el.mediaWrap.children.length > 0;

    if (!hadContent) {
      /* First load: media already preloaded during loading screen — show and play immediately */
      clearTimers();
      setPanelPatternForPost(post);
      applyRandomPalette();
      updatePostMeta(post);
      renderCaptionText(post.text);
      if (el.captionWrap) {
        el.captionWrap.classList.remove("visible");
        setTimeout(() => {
          el.captionWrap?.classList.add("visible");
          fitCaptionFont();
        }, CAPTION_DELAY_MS);
      }
      if (isVid) {
        let video = el.mediaPreload && el.mediaPreload.querySelector("video");
        if (video) {
          el.mediaPreload.removeChild(video);
          el.mediaWrap.appendChild(video);
        } else {
          video = document.createElement("video");
          video.crossOrigin = "anonymous";
          video.src = url;
          video.preload = "auto";
          video.muted = !soundOn;
          if (!soundOn) video.setAttribute("muted", "");
          video.playsInline = true;
          video.setAttribute("playsinline", "");
          video.setAttribute("webkit-playsinline", "");
          el.mediaWrap.appendChild(video);
        }
        showMediaProgress(true);
        currentVideo = video;
        media3DStage?.setSource(video);
        applyColorsFromSource(video, true);
        video.addEventListener("ended", onVideoEnded);
        video.addEventListener("loadedmetadata", () => { updateMediaProgress(0, video.duration); });
        video.addEventListener("timeupdate", () => { updateMediaProgress(video.currentTime, video.duration); });
        const tryPlay = () => { if (video.paused) { const p = video.play(); if (p && typeof p.catch === "function") p.catch(() => {}); } };
        video.addEventListener("canplay", tryPlay, { once: true });
        tryPlay();
        requestAnimationFrame(() => requestAnimationFrame(tryPlay));
        setTimeout(tryPlay, 80);
        setTimeout(tryPlay, 200);
      } else {
        el.mediaWrap.innerHTML = "";
        showMediaProgress(true);
        let img = el.mediaPreload && el.mediaPreload.querySelector("img");
        if (img) {
          el.mediaPreload.removeChild(img);
        } else {
          img = document.createElement("img");
          img.crossOrigin = "anonymous";
          img.src = url;
        }
        img.alt = post.alt_text || post.text || "";
        el.mediaWrap.appendChild(img);
        media3DStage?.setSource(img);
        applyColorsFromSource(img, false);
        const start = Date.now();
        const totalSec = DURATION_MS / 1000;
        updateMediaProgress(0, totalSec);
        progressInterval = setInterval(() => {
          const elapsed = Date.now() - start;
          const elapsedSec = elapsed / 1000;
          const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
          updateMediaProgress(elapsedSec, totalSec);
          if (pct >= 100) { clearInterval(progressInterval); progressInterval = null; next(); }
        }, 50);
      }
      updateCounter();
      return;
    }

    /* Screen already has content: load next in background, then swap */
    clearTimers();
    if (el.mediaPreload) el.mediaPreload.innerHTML = "";
    const thisLoadId = ++nextLoadId;

    function applyPostToUI(p) {
      setPanelPatternForPost(p);
      applyRandomPalette();
      updatePostMeta(p);
      renderCaptionText(p.text);
      if (el.captionWrap) {
        el.captionWrap.classList.remove("visible");
        setTimeout(() => {
          el.captionWrap?.classList.add("visible");
          fitCaptionFont();
        }, CAPTION_DELAY_MS);
      }
      updateCounter();
    }

    if (isVid) {
      const video = document.createElement("video");
      const posterUrl = getVideoPoster(post);
      video.crossOrigin = "anonymous";
      video.src = url;
      if (posterUrl) video.poster = posterUrl;
      video.preload = "auto";
      const muted = !soundOn;
      video.muted = muted;
      if (muted) video.setAttribute("muted", "");
      video.playsInline = true;
      video.loop = false;
      video.autoplay = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("webkit-playsinline", "");
      video.addEventListener("error", () => { if (thisLoadId === nextLoadId) next(); }, { once: true });
      el.mediaPreload.appendChild(video);
      video.addEventListener("canplay", () => {
        if (thisLoadId !== nextLoadId) return;
        el.mediaWrap.innerHTML = "";
        showMediaProgress(true);
        el.mediaPreload.removeChild(video);
        el.mediaWrap.appendChild(video);
        currentVideo = video;
        media3DStage?.setSource(video);
        applyPostToUI(post);
        applyColorsFromSource(video, true);
        video.addEventListener("ended", onVideoEnded);
        video.addEventListener("loadedmetadata", () => { updateMediaProgress(0, video.duration); });
        video.addEventListener("timeupdate", () => { updateMediaProgress(video.currentTime, video.duration); });
        const tryPlay = () => { if (video.paused) { const p = video.play(); if (p && typeof p.catch === "function") p.catch(() => {}); } };
        tryPlay();
        requestAnimationFrame(() => { requestAnimationFrame(tryPlay); });
      }, { once: true });
    } else {
      const img = document.createElement("img");
      img.crossOrigin = "anonymous";
      img.alt = post.alt_text || post.text || "";
      img.addEventListener("error", () => { if (thisLoadId === nextLoadId) next(); }, { once: true });
      img.addEventListener("load", () => {
        if (thisLoadId !== nextLoadId) return;
        el.mediaWrap.innerHTML = "";
        showMediaProgress(true);
        el.mediaWrap.appendChild(img);
        media3DStage?.setSource(img);
        applyPostToUI(post);
        applyColorsFromSource(img, false);
        const start = Date.now();
        const totalSec = DURATION_MS / 1000;
        updateMediaProgress(0, totalSec);
        progressInterval = setInterval(() => {
          const elapsed = Date.now() - start;
          const elapsedSec = elapsed / 1000;
          const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
          updateMediaProgress(elapsedSec, totalSec);
          if (pct >= 100) { clearInterval(progressInterval); progressInterval = null; next(); }
        }, 50);
      }, { once: true });
      img.src = url;
    }
  }

  function onVideoEnded() {
    next();
  }

  async function loadMorePosts() {
    if (loadingMore || !nextCursor) return false;
    loadingMore = true;
    try {
      const res = await fetch("/api/posts?limit=20&cursor=" + encodeURIComponent(nextCursor));
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.data)) return false;
      const newItems = data.data.filter((p) => getMediaUrl(p));
      if (newItems.length === 0) { nextCursor = null; return false; }
      const startIndex = posts.length;
      posts.push(...newItems);
      nextCursor = data.cursor || null;
      index = startIndex;
      showPost();
      return true;
    } catch (_) {
      return false;
    } finally {
      loadingMore = false;
    }
  }

  async function next() {
    clearTimers();
    if (randomMode && posts.length > 1) {
      let nextIndex = Math.floor(Math.random() * posts.length);
      if (nextIndex === index && posts.length > 1) nextIndex = (index + 1) % posts.length;
      index = nextIndex;
      showPost();
      return;
    }
    if (index + 1 < posts.length) {
      index++;
      showPost();
      return;
    }
    if (nextCursor) {
      const gotMore = await loadMorePosts();
      if (gotMore) return;
    }
    index = 0;
    showPost();
  }

  function prev() {
    clearTimers();
    index = index <= 0 ? posts.length - 1 : index - 1;
    showPost();
  }

  if (el.navPrev) el.navPrev.addEventListener("click", () => prev());
  if (el.navNext) el.navNext.addEventListener("click", () => next());

  if (el.panelMedia) el.panelMedia.addEventListener("click", () => revealProgressTemporarily());

  if (el.soundToggle) {
    el.soundToggle.addEventListener("click", () => {
      soundOn = !soundOn;
      if (currentVideo) currentVideo.muted = !soundOn;
      updateSoundButton();
    });
  }
  if (el.randomToggle) {
    el.randomToggle.addEventListener("click", () => {
      randomMode = !randomMode;
      updateRandomButton();
    });
  }
  updateSoundButton();
  updateRandomButton();

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { next(); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { prev(); e.preventDefault(); }
  });

  let resizeTimeout = null;
  window.addEventListener("resize", () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      fitCaptionFont();
      media3DStage?.resize();
    }, 150);
  });

  async function fetchPosts() {
    showReconnect(false);
    showSplash(false);
    showLoading(true);
    startLoadingProgress();
    updateLoadingStatus("Connecting to Threads…");
    updateLoadingDetail("Checking authentication");
    updateLoadingStatus("Connecting to Threads...");
    try {
      const all = [];
      let cursor = null;
      let page = 0;
      do {
        page++;
        updateLoadingStatus("Fetching your posts…");
        updateLoadingDetail(page === 1 ? "Requesting first page" : "Page " + page + " — " + all.length + " so far");

        updateLoadingStatus("Fetching your posts...");
        updateLoadingDetail(page === 1 ? "Requesting first page" : "Loading page " + page + " - " + all.length + " collected");
        const url = cursor
          ? "/api/posts?limit=50&cursor=" + encodeURIComponent(cursor)
          : "/api/posts?limit=50";
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            showLoading(false);
            showReconnect(true, data.error || "No token or expired.");
            return;
          }
          throw new Error(data.error || "API error");
        }
        const list = Array.isArray(data.data) ? data.data : [];
        all.push(...list);
        cursor = data.cursor || null;
        bumpLoadingProgress(18 + Math.min(58, page * 8));
        updateLoadingDetail(all.length + " posts received" + (cursor ? " · fetching more…" : ""));
        updateLoadingDetail(all.length + " posts received" + (cursor ? " - loading next batch..." : " - preparing launch"));
      } while (cursor);

      updateLoadingStatus("Preparing your thread…");
      updateLoadingDetail("Filtering posts with media");
      updateLoadingStatus("Preparing your thread...");
      bumpLoadingProgress(90);
      posts = all.filter((p) => getMediaUrl(p));
      nextCursor = null;

      if (posts.length === 0) {
        await finishLoadingProgress();
        showLoading(false);
        media3DStage?.clear();
        el.mediaWrap.innerHTML = '<div class="empty-state">No posts with media.</div>';
        if (el.postMeta) el.postMeta.textContent = "";
        updateCounter();
        return;
      }
      index = posts.length > 1 ? Math.floor(Math.random() * posts.length) : 0;
      const firstPost = posts[index];
      const firstUrl = getMediaUrl(firstPost);
      const firstIsVid = isVideo(firstPost);

      /* Do not show any real thread content during load. Preload first media off-screen only. */
      media3DStage?.clear();
      if (el.mediaWrap) el.mediaWrap.innerHTML = "";
      if (el.mediaPreload) el.mediaPreload.innerHTML = "";

      let firstMediaReady = Promise.resolve();
      if (firstIsVid) {
        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.src = firstUrl;
        const posterUrl = getVideoPoster(firstPost);
        if (posterUrl) video.poster = posterUrl;
        video.preload = "auto";
        video.muted = !soundOn;
        if (!soundOn) video.setAttribute("muted", "");
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.setAttribute("webkit-playsinline", "");
        if (el.mediaPreload) el.mediaPreload.appendChild(video);
        firstMediaReady = new Promise((resolve) => {
          video.addEventListener("canplay", () => resolve(), { once: true });
          video.addEventListener("error", () => resolve(), { once: true });
        });
      } else {
        const img = document.createElement("img");
        img.crossOrigin = "anonymous";
        img.alt = firstPost.alt_text || firstPost.text || "";
        if (el.mediaPreload) el.mediaPreload.appendChild(img);
        firstMediaReady = new Promise((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
          img.src = firstUrl;
        });
      }

      updateLoadingStatus("Finalizing launch...");
      updateLoadingDetail("Preparing first frame");
      bumpLoadingProgress(96);
      await firstMediaReady;
      updateLoadingStatus("Ready");
      updateLoadingDetail("Opening Threadframe");
      await finishLoadingProgress();
      showLoading(false);
      showSplash(true);
      runLaunchSplashThenShowPost(() => showPost());
      return;

    } catch (err) {
      showLoading(false);
      showReconnect(true, "Could not load posts. " + (err.message || ""));
    }
  }

  fetchPosts();
})();
