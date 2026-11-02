/* Rest Bakery: quick order, order form, reveals */
(() => {
  'use strict';

  // Replace with the bakery's real inbox before going live.
  const ORDER_EMAIL = 'hello@restbakery.example';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const form = document.querySelector('[data-order]');
  const orderSection = document.getElementById('order');
  const bake = form.querySelector('#bake');
  const qty = form.querySelector('#qty');
  const date = form.querySelector('#date');

  /* Sticky nav hairline once the page scrolls */
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('is-stuck', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Quick order and menu links prefill the form */
  function goToOrder(value) {
    if (value) {
      const match = [...bake.options].find((o) => o.value === value);
      if (match) { bake.value = match.value; clearError('bake'); }
    }
    orderSection.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => qty.focus({ preventScroll: true }), reduceMotion ? 0 : 700);
  }

  document.querySelector('[data-quick]').addEventListener('submit', (e) => {
    e.preventDefault();
    goToOrder(e.currentTarget.querySelector('select').value);
  });

  document.querySelectorAll('[data-pick]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); goToOrder(a.dataset.pick); });
  });

  /* Quantity stepper */
  const clampQty = (v) => Math.max(1, Math.min(99, Number.isFinite(v) ? v : 1));
  form.querySelectorAll('[data-step]').forEach((b) => {
    b.addEventListener('click', () => { qty.value = clampQty((parseInt(qty.value, 10) || 1) + Number(b.dataset.step)); });
  });
  qty.addEventListener('change', () => { qty.value = clampQty(parseInt(qty.value, 10)); });

  /* Date: no past dates */
  const now = new Date();
  date.min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  /* Validation */
  function setError(id) {
    form.querySelector(`#err-${id}`).hidden = false;
    form.querySelector(`#${id}`).setAttribute('aria-invalid', 'true');
  }
  function clearError(id) {
    const err = form.querySelector(`#err-${id}`);
    if (err) err.hidden = true;
    form.querySelector(`#${id}`).removeAttribute('aria-invalid');
  }
  ['bake', 'date', 'name', 'contact'].forEach((id) => {
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
    if (!date.value || date.value < date.min) { setError('date'); bad.push(date); }
    if (!name.value.trim()) { setError('name'); bad.push(name); }
    const c = contact.value.trim();
    if (!(/\S+@\S+\.\S+/.test(c) || c.replace(/\D/g, '').length >= 7)) { setError('contact'); bad.push(contact); }

    if (bad.length) { success.hidden = true; bad[0].focus(); return; }

    const when = new Date(`${date.value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const lines = [
      'Hi Rest Bakery,',
      '',
      `I'd like to order: ${bake.value}`,
      `Quantity: ${qty.value}`,
      `Needed by: ${when}`,
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
  const heroMedia = document.querySelector('.hero__media');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('.section-head, .item, .steps li, .order__intro, .form').forEach((el, i) => {
      el.classList.add('reveal');
      el.style.transitionDelay = `${(i % 3) * 80}ms`;
      io.observe(el);
    });
    io.observe(heroMedia);
  } else {
    heroMedia.classList.add('is-in');
  }

  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
