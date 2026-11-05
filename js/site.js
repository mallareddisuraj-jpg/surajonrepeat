(() => {
  const dlg = document.getElementById('lb');
  const stage = document.getElementById('lb-stage');
  const title = document.getElementById('lb-title');
  const saveData = navigator.connection && navigator.connection.saveData;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll-in reveals
  const seen = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => seen.observe(el));

  // Silent preview loops: only load and play what is on screen
  if (!saveData && !calm) {
    const vis = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting) {
        if (!v.src) v.src = v.dataset.src;
        v.play().then(() => v.classList.add('on')).catch(() => {});
      } else v.pause();
    }), { threshold: 0.35 });
    document.querySelectorAll('video[data-src]').forEach(v => vis.observe(v));
  }

  // Lightbox
  const open = (node, label) => {
    stage.replaceChildren(node);
    title.textContent = label || '';
    dlg.showModal();
  };
  dlg.addEventListener('close', () => { if (!dlg.open) stage.replaceChildren(); });
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.classList.contains('lb')) dlg.close(); });
  document.getElementById('lb-close').addEventListener('click', () => dlg.close());

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-film],[data-img],[data-yt]');
    if (!t) return;
    e.preventDefault();
    const label = t.dataset.label;
    if (t.dataset.film) {
      const v = document.createElement('video');
      v.src = t.dataset.film; v.controls = true; v.autoplay = true; v.playsInline = true;
      open(v, label);
    } else if (t.dataset.img) {
      const i = document.createElement('img');
      i.src = t.dataset.img; i.alt = label || '';
      open(i, label);
    } else {
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${t.dataset.yt}?autoplay=1&rel=0`;
      f.title = label || 'YouTube video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      open(f, label);
    }
  });

  // Copy email
  const copy = document.getElementById('copy');
  if (copy) copy.addEventListener('click', async () => {
    const was = copy.textContent;
    try { await navigator.clipboard.writeText(copy.dataset.copy); copy.textContent = 'Copied'; }
    catch { copy.textContent = copy.dataset.copy; return; }
    setTimeout(() => { copy.textContent = was; }, 1600);
  });
})();
