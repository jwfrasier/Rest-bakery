/* Rest Bakery: sprinkle physics, quick order, order form */
(() => {
  'use strict';

  // Replace with the bakery's real inbox before going live.
  const ORDER_EMAIL = 'hello@restbakery.example';

  const COLORS = ['#ffd23f', '#2ec4b6', '#3a86ff', '#ff6b35', '#8ac926', '#ffffff', '#7b2cbf'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  /* ------------------------------------------------------------------
   * Hero: sprinkles fall, land on the wordmark and pile up.
   * Terrain is a per-pixel-column height map built from the painted
   * letters, the order slab's top edge and the hero floor.
   * ------------------------------------------------------------------ */
  const hero = document.querySelector('.hero');
  const canvas = document.querySelector('.hero__canvas');
  const slot = document.querySelector('[data-wordmark]');
  const title = document.querySelector('.hero__title');
  const slab = document.querySelector('[data-quick]');
  const ctx = canvas.getContext('2d');

  const settled = document.createElement('canvas');
  const sctx = settled.getContext('2d');

  let W = 0, H = 0, dpr = 1, scale = 1;
  let terrain = null;   // current surface y per column
  let base = null;      // surface y before any sprinkles
  let falling = [];
  let settledCount = 0;
  let maxSettled = 1600;
  let rainBudget = 0;
  let rainRate = 0;
  let running = false;
  let visible = true;
  let last = 0;
  let wordmark = null;  // {lines, size, x, ys}
  let lastWidth = 0;

  function makeSprinkle(x, y, vx = rand(-30, 30), vy = rand(0, 120)) {
    return {
      x, y, vx, vy,
      a: rand(0, Math.PI),
      va: rand(-9, 9),
      len: rand(9, 14) * scale,
      th: rand(3.6, 4.6) * scale,
      c: pick(COLORS),
    };
  }

  function drawSprinkle(c, s) {
    const dx = Math.cos(s.a) * s.len / 2;
    const dy = Math.sin(s.a) * s.len / 2;
    c.strokeStyle = s.c;
    c.lineWidth = s.th;
    c.beginPath();
    c.moveTo(s.x - dx, s.y - dy);
    c.lineTo(s.x + dx, s.y + dy);
    c.stroke();
  }

  function layoutWordmark() {
    const r = slot.getBoundingClientRect();
    const hr = hero.getBoundingClientRect();
    const box = { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
    const oneLine = box.w / Math.max(box.h, 1) > 2.6;
    const lines = oneLine ? ['REST BAKERY'] : ['REST', 'BAKERY'];
    const lh = 0.92;
    ctx.font = `100px "Bagel Fat One"`;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    let size = (box.w * 0.96 / widest) * 100;
    size = Math.min(size, (box.h * 0.92) / (lines.length * lh));
    const blockH = size * lh * lines.length;
    const top = box.y + (box.h - blockH) / 2;
    const ys = lines.map((_, i) => top + size * lh * (i + 0.82));
    return { lines, size, x: box.x + box.w / 2, ys };
  }

  function paintWordmark(c) {
    c.save();
    c.font = `${wordmark.size}px "Bagel Fat One"`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#3a1c12';
    wordmark.lines.forEach((line, i) => c.fillText(line, wordmark.x, wordmark.ys[i]));
    c.restore();
  }

  function buildTerrain() {
    const floor = H - 2;
    base = new Float32Array(W).fill(floor);

    // Letter tops, read from an unscaled offscreen paint of the wordmark.
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const octx = off.getContext('2d', { willReadFrequently: true });
    paintWordmark(octx);
    const img = octx.getImageData(0, 0, W, H).data;
    const top = Math.max(0, Math.floor(wordmark.ys[0] - wordmark.size * 1.1));
    const bottom = Math.min(H, Math.ceil(wordmark.ys[wordmark.ys.length - 1] + wordmark.size * 0.3));
    for (let x = 0; x < W; x++) {
      for (let y = top; y < bottom; y++) {
        if (img[(y * W + x) * 4 + 3] > 120) { base[x] = y; break; }
      }
    }

    // The order slab's top edge is a shelf too.
    const sr = slab.getBoundingClientRect();
    const hr = hero.getBoundingClientRect();
    const sx0 = Math.max(0, Math.round(sr.left - hr.left + 14));
    const sx1 = Math.min(W - 1, Math.round(sr.right - hr.left - 14));
    const sy = sr.top - hr.top;
    for (let x = sx0; x <= sx1; x++) if (sy < base[x]) base[x] = sy;

    terrain = Float32Array.from(base);
  }

  function resize(force) {
    const r = hero.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    // Mobile URL bars change height constantly; only rebuild on width changes.
    if (!force && w === lastWidth && Math.abs(h - H) < 120) return;
    lastWidth = w;
    W = w; H = h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = Math.max(0.75, Math.min(1.25, W / 1280));
    maxSettled = Math.round(Math.min(2200, (W * H) / 620));
    for (const cv of [canvas, settled]) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.lineCap = ctx.lineCap = 'round';

    wordmark = layoutWordmark();
    title.classList.add('is-painted');
    buildTerrain();
    sctx.clearRect(0, 0, W, H);
    falling = [];
    settledCount = 0;
    pour(Math.round(maxSettled * 1.1), 3.2);
  }

  function settle(s) {
    let c = Math.max(0, Math.min(W - 1, Math.round(s.x)));
    const reach = Math.ceil(s.len * 0.6 + s.th);
    // Slide downhill like sand: look a sprinkle-width either side, roll to the lower one.
    for (let i = 0; i < 60; i++) {
      const here = terrain[c];
      let bestDir = 0, bestDrop = s.th * 0.9;
      for (const dir of (Math.random() < 0.5 ? [-1, 1] : [1, -1])) {
        for (let d = 2; d <= reach; d += 2) {
          const j = c + dir * d;
          if (j < 0 || j >= W) break;
          const drop = terrain[j] - here;
          if (drop > bestDrop) { bestDrop = drop; bestDir = dir * d; }
        }
      }
      if (!bestDir) break;
      // Rolling off a ledge (a letter edge) means it drops out of sight behind the wordmark.
      if (bestDrop > 22 * scale) return false;
      c += bestDir;
    }
    // Narrow pits between letters swallow sprinkles instead of growing towers.
    const probe = Math.round(28 * scale);
    const lh = c - probe >= 0 ? terrain[c - probe] : terrain[c];
    const rh = c + probe < W ? terrain[c + probe] : terrain[c];
    if (terrain[c] - lh > 24 * scale && terrain[c] - rh > 24 * scale) return false;
    // Keep piles low: a sprinkle that would pile too high rolls off and is lost.
    const cap = (base[c] >= H - 4 ? 64 : 40) * scale;
    if (base[c] - terrain[c] > cap) return false;
    s.x = c + rand(-1.5, 1.5);
    s.y = terrain[c] - s.th * 0.45;
    s.a = Math.random() < 0.8 ? rand(-0.45, 0.45) : rand(0, Math.PI);
    drawSprinkle(sctx, s);
    const half = Math.ceil(Math.abs(Math.cos(s.a)) * s.len / 2 + s.th / 2);
    const lift = s.th * 0.55;
    for (let j = c - half; j <= c + half; j++) {
      if (j < 0 || j >= W) continue;
      const fall = Math.abs(j - c) / (half + 1);
      const ny = terrain[c] - lift * (1 - fall * 0.6);
      if (ny < terrain[j]) terrain[j] = ny;
    }
    settledCount++;
    return true;
  }

  function step(dt) {
    // Rain
    if (rainBudget > 0) {
      const n = Math.min(rainBudget, Math.ceil(rainRate * dt * (0.6 + Math.random() * 0.8)));
      for (let i = 0; i < n; i++) falling.push(makeSprinkle(rand(-10, W + 10), rand(-60, -10)));
      rainBudget -= n;
    }
    const g = 1500;
    for (let i = falling.length - 1; i >= 0; i--) {
      const s = falling[i];
      s.vy = Math.min(s.vy + g * dt, 950);
      s.vx *= 0.995;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.a += s.va * dt;
      if (s.x < -20 || s.x > W + 20 || s.y > H + 20) { falling.splice(i, 1); continue; }
      const c = Math.round(s.x);
      if (s.vy > 0 && c >= 0 && c < W && s.y + s.th * 0.5 >= terrain[c]) {
        // Only stick when arriving from above the surface (not inside a letter).
        if (s.y - s.vy * dt <= terrain[c] + 6 && settledCount < maxSettled) settle(s);
        falling.splice(i, 1);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    paintWordmark(ctx);
    ctx.drawImage(settled, 0, 0, W, H);
    for (const s of falling) drawSprinkle(ctx, s);
  }

  function frame(t) {
    const dt = Math.min(0.033, (t - last) / 1000 || 0.016);
    last = t;
    step(dt);
    render();
    if (visible && (falling.length || rainBudget > 0)) requestAnimationFrame(frame);
    else running = false;
  }

  function kick() {
    if (running || !visible || !wordmark) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }

  // Simulate instantly for reduced motion: same piles, no movement.
  function settleInstantly() {
    let guard = 0;
    while ((falling.length || rainBudget > 0) && guard++ < 4000) step(1 / 60);
    render();
  }

  function pour(count, seconds) {
    rainBudget += count;
    rainRate = count / seconds;
    if (reduceMotion.matches) settleInstantly(); else kick();
  }

  function sprinkleAt(x, y, count = 36) {
    for (let i = 0; i < count; i++) {
      falling.push(makeSprinkle(x + rand(-12, 12), y + rand(-12, 12), rand(-220, 220), rand(-420, -60)));
    }
    if (reduceMotion.matches) settleInstantly(); else kick();
  }

  function makeRoom() {
    // When the jar is full, clear the oldest layer so taps keep working.
    if (settledCount < maxSettled * 0.92) return;
    sctx.clearRect(0, 0, W, H);
    terrain = Float32Array.from(base);
    settledCount = 0;
  }

  hero.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button, input, label, select, textarea, form')) return;
    const r = hero.getBoundingClientRect();
    makeRoom();
    sprinkleAt(e.clientX - r.left, e.clientY - r.top);
  });

  // "More sprinkles": rain on desktop; on phones it also arms shake-to-sprinkle.
  const moreBtn = document.querySelector('[data-more-sprinkles]');
  const moreLabel = document.querySelector('[data-more-label]');
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  let shakeArmed = false;
  let lastShake = 0;

  function onMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
    const now = performance.now();
    if (mag > 22 && now - lastShake > 350) {
      lastShake = now;
      makeRoom();
      pour(90, 0.8);
    }
  }

  async function armShake() {
    if (shakeArmed || typeof DeviceMotionEvent === 'undefined') return;
    try {
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') return;
      }
      window.addEventListener('devicemotion', onMotion);
      shakeArmed = true;
      moreLabel.textContent = 'Now shake your phone';
    } catch (_) { /* motion unavailable: the button still pours */ }
  }

  moreBtn.addEventListener('click', () => {
    makeRoom();
    pour(160, 1.2);
    if (isTouch) armShake();
  });

  // Pause the loop when the hero scrolls away.
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) kick();
  }).observe(hero);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => resize(false), 180);
  });

  const start = () => resize(true);
  if (document.fonts && document.fonts.load) {
    Promise.race([
      document.fonts.load('100px "Bagel Fat One"', 'REST BAKERY'),
      new Promise((r) => setTimeout(r, 2500)),
    ]).then(start, start);
  } else {
    start();
  }

  /* ------------------------------------------------------------------
   * Sprinkle burst for celebrations (order sent).
   * ------------------------------------------------------------------ */
  const burstCanvas = document.querySelector('.burst');
  const bctx = burstCanvas.getContext('2d');
  let bits = [];
  let bursting = false;

  function burst(x, y, count = 140) {
    if (reduceMotion.matches) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    burstCanvas.width = innerWidth * d;
    burstCanvas.height = innerHeight * d;
    bctx.setTransform(d, 0, 0, d, 0, 0);
    bctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const ang = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = rand(380, 900);
      const s = makeSprinkle(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp);
      s.len *= 1.2; s.th *= 1.15;
      bits.push(s);
    }
    if (!bursting) {
      bursting = true;
      let t0 = performance.now();
      const tick = (t) => {
        const dt = Math.min(0.033, (t - t0) / 1000);
        t0 = t;
        bctx.clearRect(0, 0, innerWidth, innerHeight);
        for (let i = bits.length - 1; i >= 0; i--) {
          const s = bits[i];
          s.vy += 1300 * dt; s.vx *= 0.99;
          s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.va * dt;
          if (s.y > innerHeight + 30) { bits.splice(i, 1); continue; }
          drawSprinkle(bctx, s);
        }
        if (bits.length) requestAnimationFrame(tick);
        else { bursting = false; bctx.clearRect(0, 0, innerWidth, innerHeight); }
      };
      requestAnimationFrame(tick);
    }
  }

  /* ------------------------------------------------------------------
   * Quick order (hero) and "Order" links prefill the main form.
   * ------------------------------------------------------------------ */
  const form = document.querySelector('[data-order]');
  const orderSection = document.getElementById('order');

  function chooseBake(value) {
    const input = form.querySelector(`input[name="bake"][value="${CSS.escape(value)}"]`);
    if (input) { input.checked = true; clearError('bake'); }
  }

  function goToOrder(value) {
    if (value) chooseBake(value);
    orderSection.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => form.querySelector('#qty').focus({ preventScroll: true }), reduceMotion.matches ? 0 : 650);
  }

  slab.addEventListener('submit', (e) => {
    e.preventDefault();
    const choice = slab.querySelector('input[name="quick"]:checked');
    goToOrder(choice ? choice.value : null);
  });

  document.querySelectorAll('[data-pick]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      goToOrder(a.dataset.pick);
    });
  });

  /* ------------------------------------------------------------------
   * Order form
   * ------------------------------------------------------------------ */
  const qty = form.querySelector('#qty');
  form.querySelectorAll('[data-step]').forEach((b) => {
    b.addEventListener('click', () => {
      const v = (parseInt(qty.value, 10) || 1) + Number(b.dataset.step);
      qty.value = Math.max(1, Math.min(99, v));
    });
  });
  qty.addEventListener('change', () => {
    const v = parseInt(qty.value, 10);
    qty.value = Number.isFinite(v) ? Math.max(1, Math.min(99, v)) : 1;
  });

  const date = form.querySelector('#date');
  const today = new Date();
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  date.min = iso(today);

  const LEVELS = ['None, thanks', 'A few', 'Lots', 'Absolutely buried'];
  const range = form.querySelector('#sprinkles');
  const out = form.querySelector('#sprinkle-out');
  const syncRange = () => {
    out.textContent = LEVELS[range.value];
    range.setAttribute('aria-valuetext', LEVELS[range.value]);
  };
  range.addEventListener('input', syncRange);
  syncRange();

  // Fill the jar illustration.
  const jarFill = document.querySelector('.order__jar-fill');
  if (jarFill) {
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 70; i++) {
      const x = rand(38, 162), y = rand(96, 220);
      const a = rand(0, Math.PI), l = 7;
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', `M${(x - Math.cos(a) * l).toFixed(1)} ${(y - Math.sin(a) * l).toFixed(1)}L${(x + Math.cos(a) * l).toFixed(1)} ${(y + Math.sin(a) * l).toFixed(1)}`);
      p.setAttribute('stroke', pick(COLORS.filter((c) => c !== '#ffffff')));
      jarFill.appendChild(p);
    }
  }

  function setError(name, el) {
    const err = form.querySelector(`#err-${name}`);
    if (err) err.hidden = false;
    if (el) el.setAttribute('aria-invalid', 'true');
  }
  function clearError(name) {
    const err = form.querySelector(`#err-${name}`);
    if (err) err.hidden = true;
    const el = form.querySelector(`#${name}`);
    if (el) el.removeAttribute('aria-invalid');
  }

  ['name', 'contact', 'date'].forEach((n) => {
    form.querySelector(`#${n}`).addEventListener('input', () => clearError(n));
  });
  form.querySelectorAll('input[name="bake"]').forEach((r) => r.addEventListener('change', () => clearError('bake')));

  const success = form.querySelector('[data-success]');
  const mailtoLink = form.querySelector('[data-mailto]');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let firstBad = null;
    const bake = form.querySelector('input[name="bake"]:checked');
    if (!bake) { setError('bake'); firstBad = firstBad || form.querySelector('input[name="bake"]'); }

    const nameEl = form.querySelector('#name');
    if (!nameEl.value.trim()) { setError('name', nameEl); firstBad = firstBad || nameEl; }

    const contactEl = form.querySelector('#contact');
    const contact = contactEl.value.trim();
    const looksValid = /\S+@\S+\.\S+/.test(contact) || contact.replace(/\D/g, '').length >= 7;
    if (!looksValid) { setError('contact', contactEl); firstBad = firstBad || contactEl; }

    if (!date.value || date.value < date.min) { setError('date', date); firstBad = firstBad || date; }

    if (firstBad) { firstBad.focus(); return; }

    const when = new Date(date.value + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const lines = [
      `Hi Rest Bakery!`,
      ``,
      `I'd like to order: ${bake.value}`,
      `How many: ${qty.value}`,
      `Needed by: ${when}`,
      `Sprinkle level: ${LEVELS[range.value]}`,
      ``,
      `Name: ${nameEl.value.trim()}`,
      `Contact: ${contact}`,
    ];
    const notes = form.querySelector('#notes').value.trim();
    if (notes) lines.push('', `Notes: ${notes}`);
    const href = `mailto:${ORDER_EMAIL}?subject=${encodeURIComponent(`Order request: ${bake.value}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
    mailtoLink.href = href;

    success.hidden = false;
    success.focus({ preventScroll: true });
    const br = form.querySelector('.form__submit').getBoundingClientRect();
    burst(br.left + br.width / 2, br.top + br.height / 2, 120 + Number(range.value) * 60);
    setTimeout(() => { window.location.href = href; }, reduceMotion.matches ? 0 : 900);
  });

  /* ------------------------------------------------------------------
   * Scroll reveals: content is visible without JS; this only adds motion.
   * ------------------------------------------------------------------ */
  if (!reduceMotion.matches && 'IntersectionObserver' in window) {
    const targets = document.querySelectorAll('.bakes__head, .feature, .menu__item, .how h2, .step, .order__intro, .form, .footer__word');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 3) * 70}ms`;
      io.observe(el);
    });
  }

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
