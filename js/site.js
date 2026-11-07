(() => {
  const dlg = document.getElementById('lb');
  const stage = document.getElementById('lb-stage');
  const title = document.getElementById('lb-title');
  const saveData = navigator.connection && navigator.connection.saveData;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The tube light coming on, shared by the picture and the sound: seconds, brightness and how
  // it moves to the next point. One soft blink that curves up and back down, then on for good.
  const FLICKER = {
    end: 0.8,
    on: 0.52,
    page: [[0, 0, 'ease-in-out'], [0.2, 0.6, 'ease-in-out'], [0.38, 0, 'step-end'], [0.52, 1, 'ease-out'], [0.8, 1]],
    pings: [0.52]
  };

  // Sounds: all generated here, so there are no audio files to load. They only play after the
  // visitor has clicked or pressed something, and the nav button mutes them for good.
  const sound = (() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    const none = { lightsOn() {}, lightsOff() {}, spin() {}, stop() {}, tick() {} };
    const toggle = document.querySelector('.sound');
    if (!AC || !toggle) return none;
    let on = true, ctx = null, out = null, noise = null;
    try { on = localStorage.getItem('sound') !== 'off'; } catch (e) {}
    const VOLUME = 0.6;
    const wake = () => {
      if (!on) return;
      if (!ctx) {
        ctx = new AC();
        out = ctx.createGain();
        out.gain.value = VOLUME;
        const soft = ctx.createBiquadFilter();
        soft.type = 'lowpass';
        soft.frequency.value = 5000;
        out.connect(soft).connect(ctx.destination);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    };
    // Sound that could not start right now is dropped, never saved up for a later click
    const play = fn => {
      if (!on) return;
      const seen = navigator.userActivation;
      if (seen && !seen.hasBeenActive) return;
      wake();
      if (ctx.state === 'running') { fn(ctx.currentTime + 0.005); return; }
      const asked = performance.now();
      ctx.resume().then(() => { if (performance.now() - asked < 300) fn(ctx.currentTime + 0.005); });
    };
    const envelope = (t, peak, dur) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      g.connect(out);
      return g;
    };
    const burst = (t, peak, dur, type, freq) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      src.connect(f).connect(envelope(t, peak, dur));
      src.start(t, Math.random() * 0.8, dur + 0.02);
    };
    const tone = (t, peak, dur, freq, to, type = 'sine') => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      o.connect(envelope(t, peak, dur));
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const clunk = (t, peak = 1) => {
      burst(t, 0.16 * peak, 0.02, 'bandpass', 1300);
      tone(t, 0.55 * peak, 0.11, 150, 60);
    };
    // Pressing record on a camera: one clean, steady electronic beep with hard edges, then the
    // small ping as the lights snap on
    const recordBeep = t => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 2800;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.004);
      g.gain.setValueAtTime(0.14, t + 0.11);
      g.gain.linearRampToValueAtTime(0, t + 0.118);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.13);
      FLICKER.pings.forEach(at => tone(t + at, 0.07, 0.16, 2100, 2000));
    };
    const reelTicks = (t, ms, pitch) => {
      let at = 0, gap = 0.04;
      while (at < ms / 1000 - 0.05) {
        burst(t + at, 0.05, 0.012, 'bandpass', pitch);
        at += gap;
        gap = Math.min(0.17, gap * 1.1);
      }
    };
    const whirr = (t, ms) => {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(1100, t);
      f.frequency.exponentialRampToValueAtTime(350, t + ms / 1000);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0008, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0008, t + ms / 1000);
      src.connect(f).connect(g).connect(out);
      src.start(t);
      src.stop(t + ms / 1000 + 0.02);
    };
    addEventListener('pointerdown', wake, true);
    addEventListener('pointerup', wake, true);
    addEventListener('keydown', wake, true);
    toggle.hidden = false;
    const paint = () => toggle.setAttribute('aria-pressed', on);
    paint();
    toggle.addEventListener('click', () => {
      on = !on;
      try { localStorage.setItem('sound', on ? 'on' : 'off'); } catch (e) {}
      if (out) out.gain.value = on ? VOLUME : 0;
      paint();
      if (on) play(t => clunk(t, 0.5));
    });
    let lastTick = 0;
    return {
      lightsOn: () => play(t => { clunk(t); if (!calm) recordBeep(t + 0.02); }),
      lightsOff: () => play(t => { clunk(t); tone(t, 0.1, 0.3, 110, 50); }),
      spin: runs => play(t => {
        clunk(t, 0.9);
        whirr(t, Math.max(...runs));
        runs.forEach((ms, n) => reelTicks(t, ms, 1100 + n * 200));
      }),
      stop: () => play(t => clunk(t, 0.7)),
      tick: () => {
        const now = performance.now();
        if (now - lastTick < 28) return;
        lastTick = now;
        play(t => { burst(t, 0.1, 0.012, 'bandpass', 1800); });
      }
    };
  })();

  // Lights: the page opens dark with only the power button lit. Pressing it brings the lights up.
  // Scrolling or Escape also brings them up, so nobody who misses the button is stuck in the dark.
  const power = document.querySelector('.power');
  const room = document.querySelector('.lights-room');
  if (power && room) {
    window.__lights = true;
    const root = document.documentElement;
    const isOff = () => root.classList.contains('lights-off');
    const aimHole = () => {
      const b = power.getBoundingClientRect(), r = b.width / 2, x = b.left + r, y = b.top + r;
      room.style.setProperty('--x', x + 'px');
      room.style.setProperty('--y', y + 'px');
      room.style.setProperty('--r', r + 3 + 'px');
      room.style.setProperty('--hx', Math.max(16, b.left) + 'px');
      room.style.setProperty('--hy', b.bottom + 18 + 'px');
    };
    const label = () => power.setAttribute('aria-label', isOff() ? 'Turn the lights on' : 'Turn the lights off');
    let flickerDone = 0;
    const lightsOn = () => {
      if (!isOff()) return;
      sound.lightsOn();
      root.classList.remove('lights-off');
      label();
      try { sessionStorage.setItem('lit', '1'); } catch (e) {}
      if (calm) return;
      root.classList.add('lights-coming-on');
      const ms = FLICKER.end * 1000;
      const run = (cls, frames) => room.querySelector(cls).animate(
        frames.map(([at, v, easing]) => ({ offset: at / FLICKER.end, opacity: v, easing: easing || 'linear' })),
        { duration: ms, fill: 'both' }
      );
      const parts = [
        run('.lights-dark', FLICKER.page.map(([at, v, e]) => [at, 1 - v, e])),
        run('.lights-cold', [...FLICKER.page.slice(0, -1), [FLICKER.end, 0]]),
        power.querySelector('.rec-lit').animate(
          FLICKER.page.map(([at, v, easing]) => ({ offset: at / FLICKER.end, opacity: v, easing: easing || 'linear' })),
          { duration: ms, fill: 'both' }
        )
      ];
      clearTimeout(flickerDone);
      flickerDone = setTimeout(() => {
        root.classList.remove('lights-coming-on');
        parts.forEach(a => a.cancel());
      }, ms);
    };
    const lightsOff = () => {
      sound.lightsOff();
      root.classList.remove('lights-coming-on');
      root.classList.add('lights-off');
      label();
      aimHole();
      try { sessionStorage.removeItem('lit'); } catch (e) {}
    };
    power.addEventListener('click', () => { if (isOff()) lightsOn(); else lightsOff(); });
    addEventListener('wheel', e => { if (isOff() && e.deltaY > 0) lightsOn(); }, { passive: true });
    addEventListener('touchmove', e => { if (isOff() && !e.target.closest('.power')) lightsOn(); }, { passive: true });
    addEventListener('keydown', e => {
      if (!isOff()) return;
      if (e.key === 'Tab') { e.preventDefault(); power.focus(); }
      else if (e.target !== power && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); lightsOn(); }
      else if (['Escape', 'ArrowDown', 'PageDown', 'End'].includes(e.key)) lightsOn();
    });
    addEventListener('resize', () => { if (isOff()) aimHole(); });
    addEventListener('load', () => { if (isOff()) aimHole(); });
    if (document.fonts) document.fonts.ready.then(() => { if (isOff()) aimHole(); });
    aimHole();
    label();
  }

  // The nav slides away while scrolling down and returns on the way up, so it never sits on the content
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY, root = document.documentElement.classList;
    if (y < 80) root.remove('nav-away');
    else if (y > lastY + 6) root.add('nav-away');
    else if (y < lastY - 6) root.remove('nav-away');
    else return;
    lastY = y;
  }, { passive: true });

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

  // The eyes follow the pointer while it moves, and go back to reading the numbers when it rests or leaves.
  // Touch screens have no pointer to follow, so they only read the numbers.
  const eyesArt = document.querySelector('.eyes-art');
  if (eyesArt) {
    const irises = [...eyesArt.querySelectorAll('.iris')];
    const CENTRES = [[579.5, 335.5], [782.5, 339]]; // each eye's centre in the artwork
    const numbers = [...document.querySelectorAll('.stats b')];
    const FACE_W = 1195, REST_AFTER = 4000;
    const narrow = matchMedia('(max-width: 760px)');
    const fitSheet = () => eyesArt.setAttribute('viewBox', narrow.matches ? '0 0 1195 1270' : '0 0 2300 542');
    fitSheet();
    // Points the irises at a spot on the page; `reach` sets how quickly they hit their limit
    const lookAt = (px, py, reach) => {
      const r = eyesArt.getBoundingClientRect();
      const unit = r.width / eyesArt.viewBox.baseVal.width;
      irises.forEach((iris, i) => {
        const dx = px - (r.left + CENTRES[i][0] * unit);
        const dy = py - (r.top + CENTRES[i][1] * unit);
        const x = 25 * Math.tanh(dx / (FACE_W * unit * reach));
        const y = 8 * Math.tanh(dy / (542 * unit * reach * 0.5));
        iris.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      });
    };
    const aim = n => {
      const t = numbers[n].getBoundingClientRect();
      lookAt(t.left + t.width / 2, t.top + t.height / 2, 0.9);
    };
    let at = 0, seen = false, timer = 0, moves = 0, tracking = false, restTimer = 0, frame = 0, px = 0, py = 0;
    aim(0);
    addEventListener('resize', () => { fitSheet(); aim(at); });
    const blink = () => {
      eyesArt.classList.add('blink');
      setTimeout(() => eyesArt.classList.remove('blink'), 130);
    };
    const look = () => {
      if (!seen) return;
      moves++;
      if (tracking) {
        if (moves % 3 === 0) blink();
      } else {
        at = (at + 1) % numbers.length;
        // A blink now and then, with the eyes moving while they are shut
        if (moves % 3 === 0) { blink(); setTimeout(() => aim(at), 70); }
        else aim(at);
      }
      timer = setTimeout(look, 1300 + Math.random() * 700);
    };
    const rest = () => {
      tracking = false;
      eyesArt.classList.remove('tracking');
      if (seen) aim(at);
    };
    addEventListener('pointermove', e => {
      if (e.pointerType === 'touch' || !seen) return;
      px = e.clientX; py = e.clientY;
      if (!tracking) { tracking = true; eyesArt.classList.add('tracking'); }
      clearTimeout(restTimer);
      restTimer = setTimeout(rest, REST_AFTER);
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; if (tracking) lookAt(px, py, 0.34); });
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { clearTimeout(restTimer); rest(); });
    new IntersectionObserver(es => {
      seen = es[0].isIntersecting;
      clearTimeout(timer);
      if (!seen) { clearTimeout(restTimer); tracking = false; eyesArt.classList.remove('tracking'); }
      else if (!calm) timer = setTimeout(look, 900);
    }, { threshold: 0.2 }).observe(eyesArt);
  }

  // The Ideate line wraps around a cylinder: each column of the text is drawn narrower and
  // shorter the further it curves away, so the words turn in depth as they scroll.
  const bandBody = document.querySelector('.band .body');
  const line = bandBody && bandBody.querySelector('.marquee');
  const warp = line && document.createElement('canvas');
  const warpCtx = warp && warp.getContext && warp.getContext('2d');
  if (warpCtx) {
    const ANGLE = 1.05, PERSPECTIVE = 1.3; // how far round it curves, and how much the edges shrink
    const piece = line.firstElementChild;
    let src, loop = 1, speed = 0, type = 0, W = 0, H = 0, wd = 0, hd = 0, ratio = 1, pos = 0, last = 0, live = false, raf = 0, srcScale = 1, srcH = 1;

    const build = () => {
      ratio = Math.min(devicePixelRatio || 1, 2);
      W = bandBody.clientWidth; H = bandBody.clientHeight;
      wd = warp.width = Math.round(W * ratio);
      hd = warp.height = Math.round(H * ratio);
      type = parseFloat(getComputedStyle(piece).fontSize);
      srcScale = ratio * 1.2;
      src = document.createElement('canvas');
      const c = src.getContext('2d');
      const font = `400 ${type * srcScale}px "Peace Sans", sans-serif`;
      const parts = [...piece.childNodes].map(n => ({ text: n.textContent.toUpperCase(), red: n.nodeType === 1 }));
      c.font = font;
      const gap = type * srcScale * 0.45;
      const widths = parts.map(p => c.measureText(p.text).width);
      const full = widths.reduce((a, b) => a + b, 0) + gap;
      loop = full / srcScale;
      speed = loop * 2 / 26; // the same pace the line always had
      const cap = c.measureText('H').actualBoundingBoxAscent;
      srcH = Math.ceil(type * srcScale * 1.1);
      src.width = Math.ceil(full + type * srcScale * 2);
      src.height = srcH;
      c.font = font;
      const ink = getComputedStyle(bandBody).color, red = getComputedStyle(piece.querySelector('i')).color;
      const y = (srcH + cap) / 2;
      for (let x = 0; x < src.width; x += full) {
        let at = x;
        parts.forEach((p, i) => { c.fillStyle = p.red ? red : ink; c.fillText(p.text, at, y); at += widths[i]; });
      }
    };
    const draw = () => {
      warpCtx.clearRect(0, 0, wd, hd);
      const step = Math.max(2, Math.round(ratio * 1.5));
      const sinA = Math.sin(ANGLE), R = W / (2 * sinA);
      for (let x = 0; x < wd; x += step) {
        const th = Math.asin(((x + step / 2) / wd * 2 - 1) * sinA);
        const depth = Math.cos(th);
        const u = (((R * (th + ANGLE) + pos) % loop) + loop) % loop;
        const sw = (step / ratio / depth) * srcScale;
        const h = type * 1.26 * (PERSPECTIVE / (PERSPECTIVE + 1 - depth)) * ratio;
        warpCtx.drawImage(src, u * srcScale, 0, sw, srcH, x, (hd - h) / 2, step + 1, h);
      }
    };
    const frame = now => {
      if (!live) return;
      pos += speed * Math.min(0.05, (now - last) / 1000);
      last = now;
      draw();
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      warp.className = 'marquee-warp';
      warp.setAttribute('aria-hidden', 'true');
      bandBody.append(warp);
      bandBody.classList.add('warped');
      build();
      draw();
      if (calm) return;
      new IntersectionObserver(es => {
        live = es[0].isIntersecting;
        cancelAnimationFrame(raf);
        if (live) { last = performance.now(); raf = requestAnimationFrame(frame); }
      }).observe(bandBody);
    };
    let sizedFor = innerWidth;
    addEventListener('resize', () => { if (innerWidth !== sizedFor && warp.isConnected) { sizedFor = innerWidth; build(); draw(); } });
    (document.fonts ? document.fonts.load(`400 ${parseFloat(getComputedStyle(piece).fontSize)}px "Peace Sans"`, 'IDEATE') : Promise.resolve()).then(start, start);
  }

  // Films stage: one film fills it, the next wait in a row, and a card opens into the stage.
  // Runs before the preview observer below so the list's own videos never load.
  const buildStage = (filmList, { label, noun, upright = false, embed = false }) => {
    const HOLD = 10000, MOVE = calm ? 0 : 760;
    const films = [...filmList.children].map(li => {
      const c = li.querySelector('.card');
      const v = c.querySelector('video');
      return {
        title: c.querySelector('h3').textContent,
        meta: c.querySelector('small').textContent,
        desc: (c.querySelector('p') || {}).textContent || '',
        poster: c.querySelector('img').getAttribute('src'),
        preview: v && v.dataset.src,
        full: c.hasAttribute('data-full'), // plays its whole film before the stage moves on
        zoom: c.dataset.zoom, // crops black bars baked into the footage
        action: c.querySelector('.play').textContent,
        href: c.getAttribute('href'),
        data: { film: c.dataset.film, yt: c.dataset.yt, ig: c.dataset.ig, label: c.dataset.label }
      };
    });
    const N = films.length;
    const box = document.createElement('div');
    box.className = upright ? 'fs fs-upright' : embed ? 'fs fs-embed' : 'fs';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-roledescription', 'carousel');
    box.setAttribute('aria-label', label);
    box.innerHTML = `${upright ? '<div class="fs-glow" aria-hidden="true"><img alt=""><img alt=""></div>' : ''}<div class="fs-timer" aria-hidden="true"><i></i></div>
      <div class="fs-cards"></div>
      <div class="fs-info"><small class="mono"></small><h3></h3><p></p><a class="btn solid mono"></a></div>
      <div class="fs-nav mono"><button class="fs-arrow" type="button" aria-label="Previous ${noun}">&larr;</button><button class="fs-arrow" type="button" aria-label="Next ${noun}">&rarr;</button><span class="fs-line" aria-hidden="true"><i></i></span><span class="fs-count"></span></div>`;
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
    let W = 0, cw = 0, ch = 0, gap = 0, x0 = 0, y0 = 0, H = 0, px = 0, pw = 0, py = 0, ph = 0;
    const offset = i => (i - active + N) % N;
    const slotLeft = off => x0 + (off - 1) * (cw + gap);

    const measure = () => {
      W = box.clientWidth; H = box.clientHeight;
      const narrow = W < 760, nav = narrow ? 62 : 86;
      gap = narrow ? 10 : 18;
      px = 0; pw = W; py = 0; ph = H; // the open card's box
      if (upright) {
        ch = Math.round(H * (narrow ? 0.2 : 0.44));
        cw = Math.round(ch * 9 / 16);
        if (narrow) x0 = info.offsetLeft;
        else {
          pw = Math.round(H * 9 / 16);
          px = Math.round(W * 0.31);
          x0 = px + pw + 34;
          box.style.setProperty('--info-w', px - info.offsetLeft - 28 + 'px');
        }
      } else {
        ch = Math.round(H * (narrow ? 0.123 : 0.228));
        cw = Math.round(ch * 16 / 9);
        x0 = narrow ? info.offsetLeft : Math.round(W * 0.5);
      }
      y0 = H - nav - ch;
      box.style.setProperty('--x0', x0 + 'px');
      box.style.setProperty('--above-row', (narrow ? nav + ch + 18 : 34) + 'px');
    };
    const place = (i, off) => {
      const c = cards[i], s = c.style;
      if (off === 0) { s.left = px + 'px'; s.top = py + 'px'; s.width = pw + 'px'; s.height = ph + 'px'; }
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

    const glow = upright ? [...box.querySelectorAll('.fs-glow img')] : [];
    let glowAt = 0;
    function fillInfo(f) {
      info.querySelector('small').textContent = f.meta;
      const h = info.querySelector('h3');
      h.textContent = f.title;
      h.classList.toggle('long', f.title.length > 24);
      const p = info.querySelector('p');
      p.textContent = f.desc;
      p.hidden = !f.desc;
    }
    const describe = () => {
      const f = films[active];
      if (glow.length) {
        glow[glowAt].classList.remove('on');
        glowAt = 1 - glowAt;
        glow[glowAt].src = f.poster;
        glow[glowAt].classList.add('on');
      }
      info.classList.remove('in');
      fillInfo(f);
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

    // Falls back to the ordinary timer if the full film can't play
    let fullBroken = false, fullDone = false;
    const playsFull = () => films[active].full && !saveData && !calm && !fullBroken;
    const fullFailed = () => { fullBroken = true; runTimer(); };
    function runTimer() {
      if (!timer) return;
      if (playsFull()) { timer.cancel(); fill.style.transform = 'scaleX(0)'; return; }
      fill.style.transform = '';
      timer.play();
      if (!canRun()) timer.pause();
    }

    // YouTube has no file to preview, so its player runs muted behind the title, a little zoomed to crop its own labels
    let frame = null, frameTimer = 0;
    const stopFrame = () => {
      clearTimeout(frameTimer);
      if (frame) { frame.remove(); frame = null; }
    };
    const startFrame = () => {
      const id = films[active].data.yt;
      if (frame || !id) return;
      const w = Math.round(Math.max(W, H * 16 / 9) * 1.28), h = Math.round(w * 9 / 16);
      frame = document.createElement('iframe');
      frame.className = 'fs-yt';
      frame.title = '';
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
      frame.allow = 'autoplay; encrypted-media';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.style.cssText = `width:${w}px;height:${h}px;margin:${-h / 2}px 0 0 ${-w / 2}px`;
      frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&start=90&loop=1&playlist=${id}`;
      // Reveal after YouTube's own icons have faded; the card's 10 seconds start then. If it never loads, carry on anyway.
      const shown = frame;
      const reveal = () => { clearTimeout(frameTimer); shown.classList.add('on'); sync(); };
      frameTimer = setTimeout(reveal, 6000);
      frame.addEventListener('load', () => { clearTimeout(frameTimer); frameTimer = setTimeout(reveal, 2300); });
      cards[active].append(frame);
    };
    const stopPreview = () => {
      stopFrame();
      vid.classList.remove('on');
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      vid.remove();
    };
    const startPreview = () => {
      if (embed) { if (!saveData && !calm && inView && !dlg.open) startFrame(); return; }
      const full = playsFull();
      const src = full ? films[active].data.film : films[active].preview;
      if (!src || saveData || calm || !inView || dlg.open) return;
      vid.loop = !full;
      vid.style.transform = films[active].zoom ? `scale(${films[active].zoom})` : '';
      cards[active].append(vid);
      vid.src = src;
      vid.play().catch(e => { if (full && e.name !== 'AbortError') fullFailed(); });
    };

    const fill = q('.fs-timer i');
    const timer = calm ? null : fill.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: HOLD, easing: 'linear' });
    const canRun = () => inView && !hover && !keyFocus && !dlg.open && !document.hidden && (!frame || frame.classList.contains('on'));
    const sync = () => {
      if (dlg.open || !inView) { stopFrame(); if (!vid.paused) vid.pause(); }
      else if (vid.isConnected && vid.paused && !vid.ended && vid.getAttribute('src')) vid.play().catch(() => {});
      else if (!vid.isConnected && !busy) startPreview();
      if (!timer || busy) return;
      if (playsFull()) { if (fullDone && canRun()) go(active + 1, 1); return; }
      if (canRun()) { if (timer.playState !== 'running') timer.play(); }
      else if (timer.playState === 'running') timer.pause();
    };

    function go(to, dir) {
      to = (to + N) % N;
      if (busy || to === active) return;
      busy = true;
      if (timer) { timer.cancel(); fill.style.transform = 'scaleX(0)'; }
      fullDone = false;
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
        runTimer();
      }, MOVE);
    }

    if (timer) timer.onfinish = () => go(active + 1, 1);
    // The full-length film drives the progress line itself and moves on when it ends
    vid.addEventListener('timeupdate', () => {
      if (timer && playsFull() && vid.duration) fill.style.transform = `scaleX(${vid.currentTime / vid.duration})`;
    });
    vid.addEventListener('ended', () => { if (playsFull()) { fullDone = true; sync(); } });
    vid.addEventListener('error', () => { if (playsFull() && vid.getAttribute('src')) fullFailed(); });
    runTimer();
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
    addEventListener('resize', () => { if (busy) return; layout(); if (embed) { stopFrame(); sync(); } });

    layout();
    cards.forEach((c, i) => { c.style.zIndex = i === 0 ? 1 : 3; });
    describe();
  };
  const reelList = document.querySelector('ul.reels');
  if (reelList) buildStage(reelList, { label: 'Reels', noun: 'reel', upright: true });
  const filmList = document.querySelector('ul.films');
  if (filmList) buildStage(filmList, { label: 'Films', noun: 'film' });
  const longList = document.querySelector('ul.yt');
  if (longList) buildStage(longList, { label: 'Long form', noun: 'video', embed: true });

  // Most-watched strip: drifts on its own in a soft wave, slows under the pointer, and can be dragged
  const makeFlow = (flow, { wave = true, pace = 38, lever = null } = {}) => {
    const originals = [...flow.children];
    for (let k = 0; k < 3; k++) originals.forEach(li => {
      const c = li.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.querySelector('a, button').tabIndex = -1;
      flow.append(c);
    });
    flow.classList.add('flow');
    flow.querySelectorAll('img').forEach(i => { i.loading = 'eager'; i.draggable = false; });
    const items = [...flow.children];
    const BASE = pace;
    let lefts = [], setW = 1, off = 0, speed = BASE, want = BASE, seen = false, raf = 0, last = 0, width = 0, clock = 0;
    let dragging = false, held = false, startX = 0, startOff = 0, moved = 0, lastX = 0, lastT = 0, thrown = 0;
    const size = () => {
      items.forEach(li => { li.style.transform = ''; });
      flow.style.transform = '';
      lefts = items.map(li => li.offsetLeft + li.offsetWidth / 2);
      setW = items[originals.length].offsetLeft - items[0].offsetLeft;
      width = flow.parentElement.clientWidth;
    };
    const tick = now => {
      if (!seen) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;
      if (!dragging && !held) {
        speed += (want - speed) * Math.min(1, dt * 2.6); // eases into and out of the drift
        thrown *= Math.exp(-dt * 3);
        off += (speed + thrown) * dt;
      }
      off = ((off % setW) + setW) % setW;
      flow.style.transform = `translate3d(${-off}px,0,0)`;
      if (lever) showLever();
      const amp = width < 760 ? 6 : 11;
      if (wave) items.forEach((li, i) => {
        const x = lefts[i] - off;
        if (x < -160 || x > width + 160) return;
        const phase = x / width * Math.PI * 3 + clock * 0.75;
        li.style.transform = `translate3d(0,${(Math.sin(phase) * amp).toFixed(1)}px,0) rotate(${(Math.cos(phase) * 3).toFixed(2)}deg)`;
      });
      raf = requestAnimationFrame(tick);
    };
    flow.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') want = 0; });
    flow.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') want = BASE; });
    flow.addEventListener('focusin', () => { want = 0; off = 0; flow.parentElement.scrollLeft = 0; });
    flow.addEventListener('focusout', () => { want = BASE; });
    flow.addEventListener('pointerdown', e => {
      dragging = true; moved = 0; thrown = 0;
      startX = lastX = e.clientX; startOff = off; lastT = e.timeStamp;
    });
    addEventListener('pointermove', e => {
      if (!dragging) return;
      moved = Math.max(moved, Math.abs(e.clientX - startX));
      off = startOff - (e.clientX - startX);
      if (e.timeStamp > lastT) { thrown = -(e.clientX - lastX) / (e.timeStamp - lastT) * 1000; lastX = e.clientX; lastT = e.timeStamp; }
    });
    const release = () => { dragging = false; thrown = Math.max(-1800, Math.min(1800, thrown)); };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
    flow.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    flow.addEventListener('dragstart', e => e.preventDefault());
    // The lever covers one full run of the row; grabbing it holds the drift
    let grip = null, travel = 0, shown = -1;
    const showLever = () => {
      travel = lever.clientWidth - grip.offsetWidth;
      const at = off / setW;
      grip.style.transform = `translate3d(${(at * travel).toFixed(1)}px,0,0)`;
      const pct = Math.round(at * 100);
      if (pct !== shown) { shown = pct; lever.setAttribute('aria-valuenow', pct); }
    };
    if (lever) {
      grip = lever.firstElementChild;
      let grabAt = 0, lastNotch = -1;
      const seek = x => {
        const left = lever.getBoundingClientRect().left;
        const r = (x - left - grabAt) / (lever.clientWidth - grip.offsetWidth);
        off = Math.max(0, Math.min(0.9999, r)) * setW;
        const notch = Math.floor(off / setW * 36);
        if (notch !== lastNotch) { lastNotch = notch; sound.tick(); }
        thrown = 0; speed = 0;
        flow.style.transform = `translate3d(${-off}px,0,0)`;
        showLever();
      };
      lever.addEventListener('pointerdown', e => {
        const g = grip.getBoundingClientRect();
        // Grabbing the handle keeps it under the finger; clicking the track centres it there
        grabAt = e.target === grip ? e.clientX - g.left : g.width / 2;
        held = true;
        lever.classList.add('held');
        lever.setPointerCapture(e.pointerId);
        seek(e.clientX);
        e.preventDefault();
      });
      lever.addEventListener('pointermove', e => { if (held) seek(e.clientX); });
      const letGo = () => { held = false; lever.classList.remove('held'); };
      lever.addEventListener('pointerup', letGo);
      lever.addEventListener('pointercancel', letGo);
      lever.addEventListener('keydown', e => {
        const step = setW / originals.length * (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
        if (!step) return;
        e.preventDefault();
        off = (off + step + setW) % setW;
        sound.tick();
        speed = 0;
        flow.style.transform = `translate3d(${-off}px,0,0)`;
        showLever();
      });
    }
    addEventListener('resize', size);
    addEventListener('load', size);
    size();
    new IntersectionObserver(es => {
      seen = es[0].isIntersecting;
      cancelAnimationFrame(raf);
      if (seen) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }).observe(flow.parentElement);
  };
  const stripList = document.querySelector('.mini ul');
  if (stripList && !calm) makeFlow(stripList);
  // Packaging: the same drifting row, flat so the box designs stay easy to read
  const packList = document.querySelector('ul.pack');
  if (packList && !calm) {
    const wrap = document.createElement('div');
    wrap.className = 'pack-flow';
    packList.before(wrap);
    wrap.append(packList);
    packList.querySelectorAll('.reveal').forEach(li => li.classList.remove('reveal'));
    const lever = document.createElement('div');
    lever.className = 'pack-lever';
    lever.tabIndex = 0;
    lever.setAttribute('role', 'slider');
    lever.setAttribute('aria-label', 'Scroll through the packaging designs');
    lever.setAttribute('aria-valuemin', '0');
    lever.setAttribute('aria-valuemax', '100');
    lever.innerHTML = '<span></span>';
    wrap.after(lever);
    makeFlow(packList, { wave: false, pace: 30, lever });
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
      if (calm) { sound.stop(); show(next); return; }
      busy = true;
      sizeReels();
      slot.classList.remove('won');
      slot.classList.add('spinning');
      sound.spin(reels.map((_, n) => 1050 + n * 430));
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
        sound.stop();
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
