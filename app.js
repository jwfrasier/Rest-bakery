/* Rest Bakery: menu picker, order form, reveals */
(() => {
  'use strict';

  // Replace with the bakery's real inbox before going live.
  const ORDER_EMAIL = 'hello@restbakery.example';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const ITEMS = {
    'Chocolate chip cookies': {
      name: 'Chocolate Chip Cookies',
      desc: 'Thick, chewy and loaded with chocolate. The cookie the whole week revolves around.',
      img: 'assets/photos/cookie.jpg',
      alt: 'A thick chocolate chip cookie held in a hand, broken open to show melted chocolate',
    },
    'Country sourdough': {
      name: 'Country Sourdough',
      desc: 'Naturally leavened, scored by hand and baked to a deep, crackly golden crust.',
      img: 'assets/photos/sourdough.jpg',
      alt: 'A sourdough loaf with a deep golden, scored crust on a cutting board',
    },
    'Monster cookies': {
      name: 'Monster Cookies',
      desc: 'Chunky cookies packed with candy and chocolate, each one with its own goofy face.',
      img: 'assets/photos/monster-cookies.jpg',
      alt: 'Cookies decorated with googly eyes and chocolate smiles cooling on a rack',
    },
    'Fudgy brownies': {
      name: 'Fudgy Brownies',
      desc: 'Dense, chocolatey squares with a crackly top. Decorations change with the season.',
      img: 'assets/photos/brownies.jpg',
      alt: 'Fudgy brownies topped with white chocolate ghosts',
    },
  };

  /* Next Saturday pickup date */
  const sat = new Date();
  sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7));
  document.querySelectorAll('[data-next-saturday]').forEach((el) => {
    el.textContent = sat.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  });

  /* Hero picker: selecting a bake swaps the photo and copy */
  const pickForm = document.querySelector('[data-pick-form]');
  const heroImg = document.querySelector('[data-hero-img]');
  const heroName = document.querySelector('[data-hero-name]');
  const heroDesc = document.querySelector('[data-hero-desc]');
  const selectedLabel = document.querySelector('[data-selected-label]');
  const qtyOut = document.querySelector('[data-qty-out]');
  let qty = 1;

  // Warm the cache so swaps are instant.
  Object.values(ITEMS).forEach((it) => { const i = new Image(); i.src = it.img; });

  function show(value) {
    const it = ITEMS[value];
    if (!it) return;
    selectedLabel.textContent = value;
    heroName.textContent = it.name;
    heroDesc.textContent = it.desc;
    if (heroImg.getAttribute('src') === it.img) return;
    if (reduceMotion) { heroImg.src = it.img; heroImg.alt = it.alt; return; }
    heroImg.classList.add('is-swapping');
    setTimeout(() => {
      heroImg.src = it.img;
      heroImg.alt = it.alt;
      const done = () => heroImg.classList.remove('is-swapping');
      if (heroImg.complete) requestAnimationFrame(done); else heroImg.onload = done;
    }, 220);
  }

  pickForm.addEventListener('change', (e) => { if (e.target.name === 'item') show(e.target.value); });

  pickForm.querySelectorAll('[data-qty]').forEach((b) => {
    b.addEventListener('click', () => {
      qty = Math.max(1, Math.min(99, qty + Number(b.dataset.qty)));
      qtyOut.textContent = qty;
    });
  });

  /* Order form */
  const form = document.querySelector('[data-order]');
  const bake = form.querySelector('#bake');
  const qtyInput = form.querySelector('#qty');
  const orderSection = document.getElementById('order');

  pickForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const chosen = pickForm.querySelector('input[name="item"]:checked');
    if (chosen) { bake.value = chosen.value; clearError('bake'); }
    qtyInput.value = qty;
    orderSection.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => form.querySelector('#name').focus({ preventScroll: true }), reduceMotion ? 0 : 700);
  });

  qtyInput.addEventListener('change', () => {
    const v = parseInt(qtyInput.value, 10);
    qtyInput.value = Number.isFinite(v) ? Math.max(1, Math.min(99, v)) : 1;
  });

  function setError(id) {
    form.querySelector(`#err-${id}`).hidden = false;
    form.querySelector(`#${id}`).setAttribute('aria-invalid', 'true');
  }
  function clearError(id) {
    const err = form.querySelector(`#err-${id}`);
    if (err) err.hidden = true;
    form.querySelector(`#${id}`).removeAttribute('aria-invalid');
  }
  ['bake', 'name', 'contact'].forEach((id) => {
    const el = form.querySelector(`#${id}`);
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => clearError(id));
  });

  const success = form.querySelector('[data-success]');
  const mailtoLink = form.querySelector('[data-mailto]');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.querySelector('#name');
    const contact = form.querySelector('#contact');
    const bad = [];
    if (!bake.value) { setError('bake'); bad.push(bake); }
    if (!name.value.trim()) { setError('name'); bad.push(name); }
    const c = contact.value.trim();
    if (!(/\S+@\S+\.\S+/.test(c) || c.replace(/\D/g, '').length >= 7)) { setError('contact'); bad.push(contact); }
    if (bad.length) { success.hidden = true; bad[0].focus(); return; }

    const pickup = sat.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const lines = [
      'Hi Rest Bakery,',
      '',
      `I'd like to order: ${bake.value}`,
      `Quantity: ${qtyInput.value}`,
      `Pickup: ${pickup}`,
      '',
      `Name: ${name.value.trim()}`,
      `Contact: ${c}`,
    ];
    const notes = form.querySelector('#notes').value.trim();
    if (notes) lines.push('', `Notes: ${notes}`);

    const href = `mailto:${ORDER_EMAIL}?subject=${encodeURIComponent(`Order request: ${bake.value}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
    mailtoLink.href = href;
    success.hidden = false;
    success.focus({ preventScroll: true });
    window.location.href = href;
  });

  /* Reveals: content is visible without JS; this only adds the entrance */
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.why h2, .why__list li, .kitchen__head, .shot, .order__intro, .form').forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 3) * 70}ms`;
      io.observe(el);
    });
  }

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
