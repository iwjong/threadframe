/**
 * FREN Frame Player — 2:1 magazine layout, color extraction, counter, arrows, random.
 */
(function () {
  const DURATION_MS = 7000;
  const CAPTION_DELAY_MS = 400;
  const PROGRESS_REVEAL_MS = 2500;
  const SPLASH_SLIDE_DURATION_MS = 7000;
  const SPLASH_SLIDE_COUNT = 3;
  const COLOR_SAMPLE_SIZE = 48;
  const VIDEO_COLOR_UPDATE_INTERVAL_MS = 1500;
  const DEFAULT_PANEL_BG = "#f5f2ed";
  const DEFAULT_PANEL_TEXT = "#2c2a26";

  /* Fully random: pick one bg + one text independently for bold designer combinations */
  const BACKGROUNDS = [
    { hex: "#ffb6c1", name: "Pink" },
    { hex: "#ff69b4", name: "Hot Pink" },
    { hex: "#ffd700", name: "Gold" },
    { hex: "#98fb98", name: "Mint" },
    { hex: "#e0ffff", name: "Cyan" },
    { hex: "#dda0dd", name: "Plum" },
    { hex: "#ff7f50", name: "Coral" },
    { hex: "#ffefd5", name: "Papaya" },
    { hex: "#1a1a2e", name: "Navy" },
    { hex: "#2d1b4e", name: "Violet" },
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
  ];
  const TEXT_COLORS = [
    { hex: "#2e8b57", name: "Green" },
    { hex: "#ffd700", name: "Yellow" },
    { hex: "#1a1a2e", name: "Navy" },
    { hex: "#ffffff", name: "White" },
    { hex: "#4b0082", name: "Indigo" },
    { hex: "#dc143c", name: "Crimson" },
    { hex: "#ff4500", name: "Orange" },
    { hex: "#228b22", name: "Forest" },
    { hex: "#8b4513", name: "Brown" },
    { hex: "#000000", name: "Black" },
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
  try {
    soundOn = sessionStorage.getItem("frameSoundOn") === "1";
    randomMode = sessionStorage.getItem("frameRandomMode") === "1";
  } catch (_) {}

  const el = {
    container: document.querySelector(".frame-container"),
    panelMedia: document.querySelector(".panel-media"),
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
    splash: document.querySelector(".splash"),
    splashSlides: document.querySelectorAll(".splash-slide"),
    reconnect: document.querySelector(".reconnect"),
    reconnectMessage: document.getElementById("reconnect-message"),
    mediaProgress: document.querySelector(".media-progress"),
    mediaProgressFill: document.querySelector(".media-progress-fill"),
    mediaTimeCurrent: document.querySelector(".media-time-current"),
    mediaTimeTotal: document.querySelector(".media-time-total"),
  };

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
    el.counter.textContent = current + "/" + total;
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

  const CAPTION_FONT_MIN = 14;
  const CAPTION_FONT_MAX = 30;
  const CAPTION_FONT_STEP = 4;

  function fitCaptionFont() {
    if (!el.captionText || !el.panelBody) return;
    const container = el.panelBody;
    const textEl = el.captionText;
    const lineHeight = 1.7;
    const maxHeight = container.clientHeight;
    if (maxHeight <= 0) return;
    textEl.style.lineHeight = lineHeight;
    let size = CAPTION_FONT_MIN;
    textEl.style.fontSize = size + "px";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 1) Prefer no word break: don't exceed width (no horizontal overflow)
        // 2) Then use as much height as possible
        while (size < CAPTION_FONT_MAX) {
          const nextSize = size + CAPTION_FONT_STEP;
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
  }
  function updateLoadingStatus(text) {
    if (el.loadingStatus) el.loadingStatus.textContent = text;
  }
  function updateLoadingDetail(text) {
    if (el.loadingDetail) el.loadingDetail.textContent = text || "";
  }
  function showSplash(show) {
    if (!el.splash) return;
    el.splash.style.display = show ? "flex" : "none";
    if (show && el.splashSlides.length) {
      el.splashSlides.forEach((s, i) => s.classList.toggle("splash-slide-active", i === 0));
    }
  }
  /** Runs splash slides; when both slides and waitFor (e.g. first video canplay) are done, hides splash and calls done. */
  function runSplashThenShowPost(done, waitFor) {
    const slidePromise = new Promise((resolve) => {
      if (!el.splash || !el.splashSlides.length) {
        resolve();
        return;
      }
      let current = 0;
      const next = () => {
        current++;
        if (current >= SPLASH_SLIDE_COUNT) {
          resolve();
          return;
        }
        el.splashSlides.forEach((s, i) => s.classList.toggle("splash-slide-active", i === current));
        setTimeout(next, SPLASH_SLIDE_DURATION_MS);
      };
      setTimeout(next, SPLASH_SLIDE_DURATION_MS);
    });
    Promise.all([slidePromise, waitFor ? waitFor : Promise.resolve()]).then(() => {
      showSplash(false);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (done) done();
      }));
    });
  }
  function applyRandomPalette() {
    if (!el.panelTypography || BACKGROUNDS.length === 0 || TEXT_COLORS.length === 0) return;
    const bg = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];
    const text = TEXT_COLORS[Math.floor(Math.random() * TEXT_COLORS.length)];
    applyPalette({ bg: bg.hex, text: text.hex, codeBg: bg.name, codeText: text.name });
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

  function updatePostMeta(post) {
    if (!el.postMeta) return;
    const dateStr = formatPostDate(post.timestamp);
    const id = post.id;
    displayedPostId = id;
    el.postMeta.textContent = dateStr ? dateStr + " · ♥ —" : "♥ —";
    if (!id) return;
    fetch("/api/insights?id=" + encodeURIComponent(id))
      .then((res) => res.json())
      .then((data) => {
        if (displayedPostId !== id) return;
        const likes = data.likes != null ? Number(data.likes) : null;
        const likeStr = likes != null ? String(likes) : "—";
        const base = dateStr ? dateStr + " · ♥ " : "♥ ";
        el.postMeta.textContent = base + likeStr;
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
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const hsl = rgbToHsl(r, g, b);
    const desat = Math.max(0, hsl.s - 12);
    const dark = hslToRgb(hsl.h, desat, Math.min(18, hsl.l * 0.35));
    const bg = `rgb(${dark.r},${dark.g},${dark.b})`;
    const text = luma > 0.5 ? "#1a1a1a" : "#e8e8e8";
    const accentR = Math.min(255, Math.round(r * 0.5 + 80));
    const accentG = Math.min(255, Math.round(g * 0.5 + 80));
    const accentB = Math.min(255, Math.round(b * 0.5 + 80));
    const accent = `rgba(${accentR},${accentG},${accentB},0.35)`;
    return { bg, text, accent };
  }

  function applyPalette(palette) {
    if (!el.panelTypography || !palette) return;
    lastAppliedColors = palette;
    el.panelTypography.style.setProperty("--panel-bg", palette.bg);
    el.panelTypography.style.setProperty("--panel-text", palette.text);
    if (el.container) el.container.style.setProperty("--ui-text", palette.text);
  }

  function resetPanelColors() {
    if (!el.panelTypography) return;
    el.panelTypography.style.setProperty("--panel-bg", DEFAULT_PANEL_BG);
    el.panelTypography.style.setProperty("--panel-text", DEFAULT_PANEL_TEXT);
    if (el.container) el.container.style.setProperty("--ui-text", DEFAULT_PANEL_TEXT);
    lastAppliedColors = null;
    if (el.postMeta) el.postMeta.textContent = "";
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
      applyRandomPalette();
      updatePostMeta(post);
      if (el.captionText) el.captionText.textContent = post.text || "\u00A0";
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
      applyRandomPalette();
      updatePostMeta(p);
      if (el.captionText) el.captionText.textContent = p.text || "\u00A0";
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
    resizeTimeout = setTimeout(fitCaptionFont, 150);
  });

  async function fetchPosts() {
    showReconnect(false);
    showLoading(true);
    updateLoadingStatus("Connecting to Threads…");
    updateLoadingDetail("Checking authentication");
    try {
      const all = [];
      let cursor = null;
      let page = 0;
      do {
        page++;
        updateLoadingStatus("Fetching your posts…");
        updateLoadingDetail(page === 1 ? "Requesting first page" : "Page " + page + " — " + all.length + " so far");

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
        updateLoadingDetail(all.length + " posts received" + (cursor ? " · fetching more…" : ""));
      } while (cursor);

      updateLoadingStatus("Preparing your thread…");
      updateLoadingDetail("Filtering posts with media");
      posts = all.filter((p) => getMediaUrl(p));
      nextCursor = null;

      if (posts.length === 0) {
        showLoading(false);
        el.mediaWrap.innerHTML = '<div class="empty-state">No posts with media.</div>';
        if (el.postMeta) el.postMeta.textContent = "";
        updateCounter();
        return;
      }
      index = posts.length > 1 ? Math.floor(Math.random() * posts.length) : 0;
      const firstPost = posts[index];
      const firstUrl = getMediaUrl(firstPost);
      const firstIsVid = isVideo(firstPost);

      showLoading(false);
      showSplash(true);
      /* Do not show any real thread content during load. Preload first media off-screen only. */
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

      runSplashThenShowPost(() => showPost(), firstMediaReady);
    } catch (err) {
      showLoading(false);
      showReconnect(true, "Could not load posts. " + (err.message || ""));
    }
  }

  fetchPosts();
})();
