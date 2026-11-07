(() => {
  const dlg = document.getElementById('lb');
  const stage = document.getElementById('lb-stage');
  const title = document.getElementById('lb-title');
  const saveData = navigator.connection && navigator.connection.saveData;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Background glass: moves at 5% of the page's scroll speed
  const glass = document.querySelector('.bg-glass');
  if (glass && !calm) {
    const RATE = 0.05;
    let sized = '';
    const fit = () => {
      const page = document.documentElement.scrollHeight;
      const key = `${innerWidth}:${Math.round(page / 100)}`; // ignore phone address-bar resizes
      if (key === sized) return;
      sized = key;
      glass.style.height = `${Math.ceil(Math.max(innerHeight, screen.height) + page * RATE)}px`;
    };
    const move = () => { glass.style.transform = `translate3d(0,${-scrollY * RATE}px,0)`; };
    addEventListener('scroll', move, { passive: true });
    addEventListener('resize', fit);
    addEventListener('load', fit);
    fit();
    move();
  }

  // Films stage: one film fills it, the next wait in a row, and a card opens into the stage.
  // Runs before the preview observer below so the list's own videos never load.
  const filmList = document.querySelector('ul.films');
  if (filmList) {
    const HOLD = 7000, MOVE = calm ? 0 : 760;
    const films = [...filmList.children].map(li => {
      const c = li.querySelector('.card');
      const v = c.querySelector('video');
      return {
        title: c.querySelector('h3').textContent,
        meta: c.querySelector('small').textContent,
        desc: (c.querySelector('p') || {}).textContent || '',
        poster: c.querySelector('img').getAttribute('src'),
        preview: v && v.dataset.src,
        zoom: c.dataset.zoom, // crops black bars baked into the footage
        action: c.querySelector('.play').textContent,
        href: c.getAttribute('href'),
        data: { film: c.dataset.film, yt: c.dataset.yt, ig: c.dataset.ig, label: c.dataset.label }
      };
    });
    const N = films.length;
    const box = document.createElement('div');
    box.className = 'fs';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-roledescription', 'carousel');
    box.setAttribute('aria-label', 'Films');
    box.innerHTML = `<div class="fs-timer" aria-hidden="true"><i></i></div>
      <div class="fs-cards"></div>
      <div class="fs-info"><small class="mono"></small><h3></h3><p></p><a class="btn solid mono"></a></div>
      <div class="fs-nav mono"><button class="fs-arrow" type="button" aria-label="Previous film">&larr;</button><button class="fs-arrow" type="button" aria-label="Next film">&rarr;</button><span class="fs-line" aria-hidden="true"><i></i></span><span class="fs-count"></span></div>`;
    filmList.replaceWith(box);

    const q = s => box.querySelector(s);
    const info = q('.fs-info'), play = q('.fs-info a'), count = q('.fs-count'), line = q('.fs-line i');
    const [prevBtn, nextBtn] = box.querySelectorAll('.fs-arrow');
    const vid = document.createElement('video');
    vid.className = 'fs-vid';
    vid.muted = true; vid.loop = true; vid.playsInline = true; vid.preload = 'none';
    vid.setAttribute('aria-hidden', 'true');
    vid.addEventListener('playing', () => vid.classList.add('on'));

    const cards = films.map((f, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fs-card';
      b.innerHTML = '<img alt="" decoding="async"><span class="fs-card-text"><small class="mono"></small><b></b></span>';
      if (f.zoom) b.firstElementChild.style.transform = `scale(${f.zoom})`;
      b.querySelector('small').textContent = f.meta.split(' / ')[0];
      b.querySelector('b').textContent = f.title;
      b.addEventListener('click', () => {
        if (i === active) { if (!busy) play.click(); }
        else go(i, 1);
      });
      q('.fs-cards').append(b);
      return b;
    });

    let active = 0, busy = false, hover = false, keyFocus = false, inView = false;
    let W = 0, cw = 0, ch = 0, gap = 0, x0 = 0, y0 = 0, H = 0;
    const offset = i => (i - active + N) % N;
    const slotLeft = off => x0 + (off - 1) * (cw + gap);

    const measure = () => {
      W = box.clientWidth; H = box.clientHeight;
      const narrow = W < 760, nav = narrow ? 62 : 86;
      ch = Math.round(H * (narrow ? 0.123 : 0.228));
      cw = Math.round(ch * 16 / 9);
      gap = narrow ? 10 : 18;
      x0 = narrow ? info.offsetLeft : Math.round(W * 0.5);
      y0 = H - nav - ch;
      box.style.setProperty('--x0', x0 + 'px');
      box.style.setProperty('--above-row', (narrow ? nav + ch + 18 : 34) + 'px');
    };
    const place = (i, off) => {
      const c = cards[i], s = c.style;
      if (off === 0) { s.left = s.top = '0px'; s.width = W + 'px'; s.height = H + 'px'; }
      else { s.left = slotLeft(off) + 'px'; s.top = y0 + 'px'; s.width = cw + 'px'; s.height = ch + 'px'; }
      const shown = off > 0 && slotLeft(off) < W;
      c.tabIndex = shown ? 0 : -1;
      if (shown) c.setAttribute('aria-label', `Show ${films[i].title}`); else c.removeAttribute('aria-label');
      c.toggleAttribute('aria-hidden', !shown && off !== 0);
      // Only fetch posters that are near the screen
      if (off === N - 1 || shown || slotLeft(off - 1) < W) {
        const img = c.firstElementChild;
        if (!img.getAttribute('src')) img.src = films[i].poster;
      }
    };
    const still = fn => {
      cards.forEach(c => c.classList.add('still'));
      fn();
      void box.offsetWidth;
      cards.forEach(c => c.classList.remove('still'));
    };
    const layout = () => { measure(); still(() => cards.forEach((c, i) => { place(i, offset(i)); c.classList.toggle('act', i === active); })); };

    const describe = () => {
      const f = films[active];
      info.classList.remove('in');
      info.querySelector('small').textContent = f.meta;
      const h = info.querySelector('h3');
      h.textContent = f.title;
      h.classList.toggle('long', f.title.length > 24);
      const p = info.querySelector('p');
      p.textContent = f.desc;
      p.hidden = !f.desc;
      play.textContent = f.action;
      play.href = f.href || f.data.film;
      Object.keys(f.data).forEach(k => { if (f.data[k]) play.dataset[k] = f.data[k]; else delete play.dataset[k]; });
      const external = /^https:\/\/www\.behance/.test(f.href || '');
      if (external) { play.target = '_blank'; play.rel = 'noopener'; } else { play.removeAttribute('target'); play.removeAttribute('rel'); }
      count.textContent = `${String(active + 1).padStart(2, '0')} / ${N}`;
      line.style.transform = `scaleX(${(active + 1) / N})`;
      void info.offsetWidth;
      info.classList.add('in');
    };

    const stopPreview = () => {
      vid.classList.remove('on');
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      vid.remove();
    };
    const startPreview = () => {
      const src = films[active].preview;
      if (!src || saveData || calm || !inView || dlg.open) return;
      vid.style.transform = films[active].zoom ? `scale(${films[active].zoom})` : '';
      cards[active].append(vid);
      vid.src = src;
      vid.play().catch(() => {});
    };

    const timer = calm ? null : q('.fs-timer i').animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: HOLD, easing: 'linear' });
    const canRun = () => inView && !hover && !keyFocus && !dlg.open && !document.hidden;
    const sync = () => {
      if (dlg.open || !inView) { if (!vid.paused) vid.pause(); }
      else if (vid.isConnected && vid.paused && vid.getAttribute('src')) vid.play().catch(() => {});
      else if (!vid.isConnected && !busy) startPreview();
      if (!timer || busy) return;
      if (canRun()) { if (timer.playState !== 'running') timer.play(); }
      else if (timer.playState === 'running') timer.pause();
    };

    function go(to, dir) {
      to = (to + N) % N;
      if (busy || to === active) return;
      busy = true;
      if (timer) timer.cancel();
      stopPreview();
      const from = active;
      const before = cards.map((_, i) => offset(i));
      active = to;
      // Cards that jump (the new stage on the way back, or cards skipped over) move without animating
      still(() => cards.forEach((c, i) => {
        const off = offset(i);
        if (dir < 0 && off === 0) { place(i, 0); c.classList.add('act'); c.style.zIndex = 0; }
        else if (dir > 0 && i !== from && off > before[i]) place(i, off);
      }));
      cards.forEach((c, i) => {
        const off = offset(i);
        if (dir > 0 && i === from) { c.style.zIndex = 0; return; }
        if (dir < 0 && off === 0) return;
        if (off === 0) { c.style.zIndex = 2; c.classList.add('act'); }
        else { c.style.zIndex = 3; c.classList.remove('act'); }
        place(i, off);
      });
      describe();
      setTimeout(() => {
        still(() => {
          cards[from].classList.remove('act');
          place(from, offset(from));
          cards.forEach((c, i) => { c.style.zIndex = i === active ? 1 : 3; });
        });
        busy = false;
        startPreview();
        if (timer) { timer.play(); if (!canRun()) timer.pause(); }
      }, MOVE);
    }

    if (timer) { timer.pause(); timer.onfinish = () => go(active + 1, 1); }
    prevBtn.addEventListener('click', () => go(active - 1, -1));
    nextBtn.addEventListener('click', () => go(active + 1, 1));
    box.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1, -1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1, 1); }
    });
    box.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hover = true; sync(); } });
    box.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hover = false; sync(); } });
    box.addEventListener('focusin', e => { keyFocus = e.target.matches(':focus-visible'); sync(); });
    box.addEventListener('focusout', () => { keyFocus = false; sync(); });
    let downX = null;
    box.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') downX = e.clientX; });
    box.addEventListener('pointerup', e => {
      if (downX === null) return;
      const dx = e.clientX - downX;
      downX = null;
      if (Math.abs(dx) > 50) { if (dx < 0) go(active + 1, 1); else go(active - 1, -1); }
    });
    box.addEventListener('pointercancel', () => { downX = null; });
    new IntersectionObserver(es => { inView = es[0].isIntersecting; sync(); }, { threshold: 0.45 }).observe(box);
    new MutationObserver(sync).observe(dlg, { attributes: true, attributeFilter: ['open'] });
    document.addEventListener('visibilitychange', sync);
    addEventListener('resize', () => { if (!busy) layout(); });

    layout();
    cards.forEach((c, i) => { c.style.zIndex = i === 0 ? 1 : 3; });
    describe();
  }

  // Photo gallery: the chosen photo sits in the middle, the others step down on each side.
  // The centre photo opens the existing lightbox through its data-img; side photos move to the centre.
  const photoList = document.querySelector('ul.photos');
  if (photoList) {
    const shots = [...photoList.children].map(li => {
      const b = li.querySelector('button');
      return { src: b.dataset.img, label: b.dataset.label, alt: li.querySelector('img').alt, pos: b.dataset.pos };
    });
    const box = document.createElement('div');
    box.className = 'ph reveal';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-roledescription', 'carousel');
    box.setAttribute('aria-label', 'Photographs');
    box.innerHTML = `<div class="ph-pills mono" role="group" aria-label="Filter photos"></div><div class="ph-stage"></div>
      <div class="ph-nav"><button class="fs-arrow" type="button" aria-label="Previous photo">&larr;</button><button class="fs-arrow" type="button" aria-label="Next photo">&rarr;</button></div>`;
    photoList.replaceWith(box);
    const stageEl = box.querySelector('.ph-stage');
    const SPOTS = [[0, 1, 0], [0.74, 0.8, 0.28], [1.24, 0.62, 0.5], [1.6, 0.5, 0.5]]; // shift, scale, dim
    let list = shots.map((_, i) => i), at = 0;

    const cards = shots.map((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ph-card';
      b.dataset.img = s.src;
      b.dataset.label = s.label;
      const img = document.createElement('img');
      img.alt = s.alt;
      img.decoding = 'async';
      if (s.pos) img.style.objectPosition = `${s.pos} 50%`;
      b.append(img);
      b.addEventListener('click', e => {
        const idx = list.indexOf(i);
        if (idx === at) return; // the document handler opens the lightbox
        e.stopPropagation();
        at = idx;
        render();
      });
      stageEl.append(b);
      return b;
    });
    const offs = cards.map(() => null);

    function render() {
      const len = list.length, half = Math.floor(len / 2);
      cards.forEach((c, i) => {
        const idx = list.indexOf(i);
        const off = idx < 0 ? null : ((idx - at + len + half) % len) - half;
        const was = offs[i];
        offs[i] = off;
        const abs = off === null ? 3 : Math.min(Math.abs(off), 3);
        const [shift, scale, dim] = SPOTS[abs];
        const dir = off === null ? 0 : Math.sign(off);
        // A photo wrapping from one end to the other jumps rather than crossing the stage
        if (off !== null && was !== null && was * off < 0 && Math.abs(was - off) > 2) c.classList.add('still');
        c.style.transform = `translate(calc(-50% + ${dir * shift * 100}%), -50%) scale(${scale})`;
        c.style.zIndex = 10 - abs;
        c.style.setProperty('--dim', dim);
        const shown = abs < 3;
        c.classList.toggle('on', shown);
        c.tabIndex = shown ? 0 : -1;
        c.toggleAttribute('aria-hidden', !shown);
        if (shown) c.setAttribute('aria-label', off === 0 ? `See the whole photo: ${shots[i].label}` : `Show this photo: ${shots[i].label}`);
        else c.removeAttribute('aria-label');
        c.style.cursor = off === 0 ? 'zoom-in' : 'pointer';
        const img = c.firstElementChild;
        if (off !== null && Math.abs(off) <= 3 && !img.getAttribute('src')) img.src = shots[i].src;
      });
      void box.offsetWidth;
      cards.forEach(c => c.classList.remove('still'));
    }
    const step = n => { at = (at + n + list.length) % list.length; render(); };

    const pills = box.querySelector('.ph-pills');
    ['All', ...new Set(shots.map(s => s.label))].forEach((name, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ph-pill';
      b.textContent = name;
      b.setAttribute('aria-pressed', n === 0);
      b.addEventListener('click', () => {
        pills.querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', o === b));
        list = shots.map((_, i) => i).filter(i => name === 'All' || shots[i].label === name);
        at = 0;
        render();
      });
      pills.append(b);
    });
    const [back, fwd] = box.querySelectorAll('.ph-nav button');
    back.addEventListener('click', () => step(-1));
    fwd.addEventListener('click', () => step(1));
    box.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    });
    let downX = null;
    stageEl.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') downX = e.clientX; });
    stageEl.addEventListener('pointerup', e => {
      if (downX === null) return;
      const dx = e.clientX - downX;
      downX = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    });
    stageEl.addEventListener('pointercancel', () => { downX = null; });
    render();
  }

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
