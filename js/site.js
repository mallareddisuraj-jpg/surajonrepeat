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
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.classList.contains('lb')) { stage.replaceChildren(); dlg.close(); } });
  document.getElementById('lb-close').addEventListener('click', () => { stage.replaceChildren(); dlg.close(); });

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-film],[data-img],[data-yt],[data-ig]');
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
    } else if (t.dataset.ig) {
      const f = document.createElement('iframe');
      f.src = `https://www.instagram.com/reel/${t.dataset.ig}/embed/`;
      f.title = label || 'Instagram reel';
      f.className = 'vert';
      f.allow = 'autoplay; encrypted-media; fullscreen';
      open(f, label);
    } else {
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${t.dataset.yt}?autoplay=1&rel=0`;
      f.title = label || 'YouTube video';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      open(f, label);
    }
  });

  // Thumbnail slot machine
  document.querySelectorAll('[data-slot]').forEach(slot => {
    const shots = [...slot.querySelectorAll('.slot-data li')].map(li => ({ src: li.dataset.src, alt: li.dataset.alt }));
    const reels = [...slot.querySelectorAll('.reel')];
    const open = slot.querySelector('.slot-open');
    const count = slot.querySelector('.slot-count');
    const lever = slot.querySelector('.slot-lever');
    const total = String(shots.length).padStart(2, '0');
    let current = 0, busy = false, bag = [];
    shots.forEach(s => { new Image().src = s.src; });

    const cell = (i, reel) => {
      const c = document.createElement('div');
      c.className = 'cell';
      c.style.backgroundImage = `url("${shots[i].src}")`;
      c.style.backgroundPosition = `${[5.4, 50, 94.6][reel]}% 50%`; // zoomed slightly to crop the black matte
      return c;
    };
    const sizeReels = () => reels.forEach(r => r.style.setProperty('--h', r.clientHeight + 'px'));
    const show = i => {
      current = i;
      reels.forEach((r, n) => r.firstElementChild.replaceChildren(cell(i, n)));
      open.dataset.img = shots[i].src;
      open.setAttribute('aria-label', `View larger: ${shots[i].alt}`);
      count.textContent = `${String(i + 1).padStart(2, '0')} / ${total}`;
    };
    // Every thumbnail appears once before any repeats
    const pick = () => {
      if (!bag.length) {
        bag = shots.map((_, i) => i).filter(i => i !== current);
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      return bag.pop();
    };
    const spin = async () => {
      if (busy) return;
      const next = pick();
      if (calm) { show(next); return; }
      busy = true;
      sizeReels();
      slot.classList.remove('won');
      slot.classList.add('spinning');
      await Promise.all(reels.map(async (r, n) => {
        const strip = r.firstElementChild;
        const fillers = 12 + n * 5;
        const cells = [cell(next, n)];
        for (let f = 0; f < fillers; f++) cells.push(cell(Math.floor(Math.random() * shots.length), n));
        cells.push(cell(current, n));
        strip.replaceChildren(...cells);
        strip.classList.add('blur');
        const run = 1050 + n * 430;
        const distance = (cells.length - 1) * r.clientHeight;
        setTimeout(() => strip.classList.remove('blur'), run * 0.8);
        const motion = strip.animate(
          [{ transform: `translateY(-${distance}px)` }, { transform: 'translateY(0)' }],
          { duration: run, easing: 'cubic-bezier(.14,.62,.2,1.025)', fill: 'forwards' }
        );
        await motion.finished;
        strip.replaceChildren(cell(next, n));
        motion.cancel();
      }));
      show(next);
      slot.classList.remove('spinning');
      slot.classList.add('won');
      setTimeout(() => slot.classList.remove('won'), 1150);
      busy = false;
    };
    const release = () => {
      lever.classList.remove('dragging', 'pulling');
      lever.style.setProperty('--pull', 0);
    };
    const autoPull = () => {
      if (busy) return;
      lever.classList.add('pulling');
      lever.style.setProperty('--pull', 1);
      setTimeout(release, 170);
      spin();
    };

    // Pull the lever by dragging it; a plain click or Enter also works
    let startY = null, dragged = false;
    lever.addEventListener('pointerdown', e => {
      startY = e.clientY;
      dragged = false;
      lever.setPointerCapture(e.pointerId);
      lever.classList.add('dragging');
    });
    lever.addEventListener('pointermove', e => {
      if (startY === null) return;
      const pull = Math.max(0, Math.min(1, (e.clientY - startY) / 130));
      if (pull > 0.05) dragged = true;
      lever.style.setProperty('--pull', pull);
    });
    const finish = e => {
      if (startY === null) return;
      const pull = Math.max(0, (e.clientY - startY) / 130);
      startY = null;
      release();
      if (pull > 0.45) spin();
    };
    lever.addEventListener('pointerup', finish);
    lever.addEventListener('pointercancel', () => { startY = null; release(); });
    lever.addEventListener('click', () => {
      if (dragged) { dragged = false; return; }
      autoPull();
    });
    slot.querySelector('.slot-spin').addEventListener('click', autoPull);
    addEventListener('resize', sizeReels);
    sizeReels();
    show(0);
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
