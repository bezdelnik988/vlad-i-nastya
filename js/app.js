/* Сайт-приглашение «Письмо при свече». Один скрипт для всех страниц. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var cover = $('cover'), slideshow = $('slideshow'), letter = $('letter'), finalScreen = $('final');
  var audio = $('music'), soundBtn = $('sound'), soundTip = $('soundTip'), hintEl = $('hint');
  var openBtn = $('openBtn'), card = $('card');
  var printA = $('printA'), printB = $('printB'), indicator = $('indicator'), counter = $('counter');
  var hintPhoto = $('hintPhoto'), skipBtn = $('skip'), againBtn = $('again'), againBtn2 = $('again2'), daysEl = $('days');

  var reduce = false;
  try { reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var can3d = !!(window.CSS && CSS.supports && CSS.supports('perspective', '900px') && CSS.supports('transform', 'rotateX(90deg)'));
  var quiet = reduce || !can3d;

  /* --- sessionStorage с защитой (приватный режим, старые WebView) --- */
  function readSession(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function writeSession(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) {} }

  /* --- высота экрана: 100vh во встроенных браузерах врёт --- */
  function setVh() { document.documentElement.style.setProperty('--vh', (window.innerHeight / 100) + 'px'); }
  function relayout() {
    setVh();
    syncCardShape();
    /* поворот телефона или показ/скрытие панели браузера во время показа фото */
    if (running && activePrint && current >= 0 && photos[current]) {
      var r = printRect(photos[current].w, photos[current].h);
      placePrint(activePrint, r); layoutChrome(r);
    }
  }
  setVh();
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', function () { setTimeout(relayout, 300); });

  /* ================= ФОТО ================= */
  var photos = [];
  (slideshow.getAttribute('data-photos') || '').split(',').forEach(function (s) {
    var p = s.trim().split(/\s+/);
    if (p[0]) photos.push({ src: 'img/photos/' + p[0], w: +p[1] || 3, h: +p[2] || 4 });
  });
  var current = -1, activePrint = null, slideTimer = null, zoomTimer = null, running = false, fadeUntil = 0;
  var SLIDE_MS = 4500;

  /* открытка в конверте — той же формы, что первый отпечаток на этом экране:
     тогда при открытии она ложится на стол без искажения */
  function syncCardShape() {
    if (!photos[0]) return;
    var r = printRect(photos[0].w, photos[0].h);
    var inner = (r.height - 2 * r.pad) / (r.width - 2 * r.pad);
    document.body.style.setProperty('--first-pt', (inner * 100).toFixed(2) + '%');
  }

  /* загрузка фото i; cb — вызвать, когда оно готово (или сразу, если уже есть).
     После каждого загруженного по цепочке подгружается следующее */
  function preload(i, cb) {
    if (i < 0 || i >= photos.length) return;
    var p = photos[i];
    if (p.loaded) { if (cb) cb(); return; }
    if (cb) (p.waiters || (p.waiters = [])).push(cb);
    if (p.loading) return;
    p.loading = true;
    var im = p.im = new Image();           /* ссылку храним, чтобы браузер не выбросил картинку из памяти */
    im.onload = im.onerror = function () {
      p.loaded = true; p.loading = false;
      var w = p.waiters || []; p.waiters = null;
      for (var k = 0; k < w.length; k++) w[k]();
      preload(i + 1);
    };
    im.src = p.src;
  }

  /* безопасные поля телефона (вырез, полоска внизу) — меряем невидимым элементом */
  var safeProbe = document.createElement('div');
  safeProbe.style.cssText = 'position:fixed;left:0;right:0;top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(safeProbe);
  function safeInsets() {
    var r = safeProbe.getBoundingClientRect();
    return { t: Math.max(0, r.top), b: Math.max(0, window.innerHeight - r.bottom) };
  }

  /* отпечаток занимает почти всю свободную полосу экрана: сверху место для кнопки звука,
     снизу — для полоски, счётчика и «Пропустить» */
  function printRect(w, h) {
    var vw = window.innerWidth, vh = window.innerHeight, ratio = w / h, s = safeInsets();
    var low = vh < 520;                                   /* телефон лежит — отступы меньше */
    var top0 = low ? 16 + s.t : 72 + s.t;
    var maxH = vh - top0 - (low ? 40 + s.b : 103 + s.b);
    var padK = 0.028;
    var pw = (ratio < 1 ? Math.min(vw * 0.94, 480) : Math.min(vw * 0.96, 640)) / (1 + 2 * padK);   /* ширина вместе с полями бумаги */
    var ph = pw / ratio, phMax = maxH - 2 * pw * padK;
    /* вертикальное фото может быть до 10 % выше своих пропорций: картинка чуть обрезается по бокам, зато крупнее */
    if (ratio < 1 && ph < phMax) ph = Math.min(phMax, ph * 1.10);
    if (ph > phMax) { ph = maxH / (1 + 2 * ratio * padK); pw = ph * ratio; }   /* не влезает по высоте — уменьшаем целиком */
    var pad = Math.round(pw * padK);
    var W = Math.round(pw + 2 * pad), H = Math.round(ph + 2 * pad);
    return { left: Math.round((vw - W) / 2), top: Math.round(top0 + (maxH - H) / 2), width: W, height: H, pad: pad };
  }

  function placePrint(el, rect) {
    el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px';
    el.style.width = rect.width + 'px'; el.style.height = rect.height + 'px';
    el.style.padding = rect.pad + 'px';
  }

  function buildIndicator() {
    indicator.innerHTML = '';
    for (var i = 0; i < photos.length; i++) { var seg = document.createElement('i'); seg.appendChild(document.createElement('b')); indicator.appendChild(seg); }
  }

  function updateIndicator(i) {
    var segs = indicator.children;
    for (var k = 0; k < segs.length; k++) segs[k].className = k < i ? 'done' : '';
    if (segs[i]) {
      segs[i].className = '';
      void segs[i].offsetWidth; /* сброс transition */
      segs[i].className = 'now';
    }
    counter.textContent = (i + 1) + ' из ' + photos.length;
  }

  function layoutChrome(rect) {
    var bottom = rect.top + rect.height, hintTop = bottom + 34;
    indicator.style.left = rect.left + 'px'; indicator.style.width = rect.width + 'px'; indicator.style.top = (bottom + 20) + 'px';
    hintPhoto.style.top = hintTop + 'px';
    /* на коротких экранах подсказке нет места над «Пропустить» — прячем, касание и так работает */
    hintPhoto.hidden = hintTop + 28 > window.innerHeight - 84;
  }

  /* показать фото i; fast — по касанию.
     Кадр выходит только после загрузки: иначе на медленной сети карточка показывала бы
     своё прошлое фото, пока грузится новое, и гость видел бы два кадра по кругу.
     Таймер до следующего кадра идёт с момента показа, а не с момента запроса */
  var showToken = 0, LOAD_WAIT_MS = 8000;
  function imgReady(img, src) { return img.getAttribute('src') === src && img.complete && img.naturalWidth > 0; }
  function showPhoto(i, fast) {
    var p = photos[i], token = ++showToken, done = false;
    var next = activePrint === printA ? printB : printA;
    var img = next.querySelector('img');
    function go(timedOut) {
      if (done || token !== showToken || !running) return;
      done = true;
      img.removeEventListener('load', onLoad); img.removeEventListener('error', onLoad);
      var prev = activePrint;
      var rect = printRect(p.w, p.h);
      next.className = 'print' + (fast ? ' fast' : '');
      if (timedOut && !imgReady(img, p.src)) { img.removeAttribute('src'); img.src = p.src; }   /* не дождались — пусть лучше пустая карточка, чем старый кадр */
      img.style.transformOrigin = ['50% 50%', '40% 35%', '60% 40%'][i % 3];
      placePrint(next, rect);
      layoutChrome(rect);
      void next.offsetWidth;
      next.className += ' show';
      if (prev) prev.className = 'print' + (fast ? ' fast' : '');
      activePrint = next;
      current = i;
      fadeUntil = Date.now() + (fast ? 450 : 800);
      updateIndicator(i);
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(function () { if (!reduce) next.className += ' zoom'; }, 50);
      /* следующее фото грузим прямо в скрытую карточку, которая его и покажет, — когда она догаснет */
      var other = next === printA ? printB : printA;
      if (photos[i + 1]) {
        setTimeout(function () {
          if (token !== showToken || !running) return;
          var oi = other.querySelector('img');
          if (oi.getAttribute('src') !== photos[i + 1].src) oi.src = photos[i + 1].src;
        }, fast ? 500 : 900);
      }
      preload(i + 2);
      schedule();
    }
    function onLoad() { go(false); }
    if (imgReady(img, p.src)) { go(false); return; }
    img.addEventListener('load', onLoad); img.addEventListener('error', onLoad);
    if (img.getAttribute('src') !== p.src) img.src = p.src;    /* грузим в саму карточку */
    setTimeout(function () { go(true); }, LOAD_WAIT_MS);
  }

  function schedule() {
    clearTimeout(slideTimer);
    slideTimer = setTimeout(function () {
      if (!running) return;
      if (current + 1 < photos.length) showPhoto(current + 1, false);
      else finishSlideshow();
    }, SLIDE_MS);
  }

  function nextPhoto(dir) {
    if (!running) return;
    if (Date.now() < fadeUntil) return;     /* пока идёт смена кадра, касания не принимаем */
    var i = current + (dir || 1);
    if (i >= photos.length) { finishSlideshow(); return; }
    if (i < 0) return;
    clearTimeout(slideTimer);          /* таймер заведёт showPhoto, когда кадр покажется */
    showPhoto(i, true);
  }

  function startSlideshow(fromCover) {
    running = true;
    document.body.className = 'locked';
    slideshow.hidden = false;
    slideshow.className = 'overlay slideshow';
    buildIndicator();
    if (fromCover) {
      /* первое фото уже на экране — это открытка из конверта, положенная на стол */
      updateIndicator(0);
      fadeUntil = Date.now() + 400;
      if (photos[1]) printB.querySelector('img').src = photos[1].src;   /* второе фото — сразу в скрытую карточку */
    } else {
      activePrint = null; printA.className = 'print'; printB.className = 'print';
      showPhoto(0, false);
    }
    setTimeout(function () {
      indicator.className = 'indicator show'; counter.className = 'counter show'; skipBtn.className = 'skip show';
      if (!readSession('vn_hint')) {
        hintPhoto.className = 'hint-photo show'; writeSession('vn_hint', '1');
        setTimeout(function () { hintPhoto.className = 'hint-photo'; }, 3000);
      }
    }, fromCover ? 0 : 400);
    if (fromCover) schedule();         /* иначе таймер заведёт showPhoto(0), когда кадр покажется */
    preload(1);
  }

  function finishSlideshow() {
    if (!running) return;
    running = false;
    clearTimeout(slideTimer);
    slideshow.className = 'overlay slideshow leaving';
    setTimeout(function () {
      slideshow.hidden = true;
      if (letter) goLetter(); else goFinal();
    }, 500);
  }

  /* касание по фото — следующее; свайп в средней зоне — вперёд/назад; два пальца — зум, не свайп */
  var tx = 0, ty = 0, tOk = false, swiped = false;
  slideshow.addEventListener('touchstart', function (e) {
    if (e.touches.length > 1) { tOk = false; return; }
    var t = e.touches[0]; tx = t.clientX; ty = t.clientY;
    tOk = tx > window.innerWidth * 0.15 && tx < window.innerWidth * 0.85;
  }, { passive: true });
  slideshow.addEventListener('touchend', function (e) {
    if (!tOk || e.touches.length) return;
    var t = e.changedTouches[0], dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dy) > 30 || Math.abs(dx) < 40) return;
    tOk = false; e.preventDefault();
    nextPhoto(dx < 0 ? 1 : -1);
    swiped = true; setTimeout(function () { swiped = false; }, 400);
  });
  slideshow.addEventListener('click', function (e) {
    if (e.target === skipBtn || skipBtn.contains(e.target)) return;
    if (swiped) return;
    nextPhoto(1);
  });
  skipBtn.addEventListener('click', function (e) { e.stopPropagation(); finishSlideshow(); });

  /* ================= ПИСЬМО / ФИНАЛ ================= */
  function focusQuiet(el) { if (!el) return; try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} } }
  function goLetter() {
    document.body.className = '';
    letter.hidden = false;
    letter.className = 'letter enter';
    window.scrollTo(0, 0);
    updateDays();
    var h = letter.querySelector('.salute');
    if (h) { h.setAttribute('tabindex', '-1'); focusQuiet(h); }
  }
  function goFinal() {
    finalScreen.hidden = false;
    void finalScreen.offsetWidth;
    finalScreen.className = 'overlay final show';
    focusQuiet(againBtn2);
  }
  function again() {
    if (letter) { letter.hidden = true; letter.className = 'letter'; }
    if (finalScreen) { finalScreen.className = 'overlay final'; finalScreen.hidden = true; }
    window.scrollTo(0, 0);
    startSlideshow(false);
  }
  if (againBtn) againBtn.addEventListener('click', again);
  if (againBtn2) againBtn2.addEventListener('click', again);

  /* «До встречи — N дней»: до 6 ноября 2026, 17:00 по Уфе (UTC+5), независимо от часового пояса телефона */
  function plural(n, a, b, c) { n = Math.abs(n) % 100; var d = n % 10; if (n > 10 && n < 20) return c; if (d > 1 && d < 5) return b; if (d === 1) return a; return c; }
  function updateDays() {
    if (!daysEl) return;
    var T = Date.UTC(2026, 10, 6, 12, 0, 0), OFF = 5 * 3600e3, day = 864e5, now = Date.now();
    if (now >= T) { daysEl.hidden = true; return; }
    var dT = Math.floor((T + OFF) / day), dN = Math.floor((now + OFF) / day), n = dT - dN;
    daysEl.innerHTML = n === 0 ? 'До встречи — <b>сегодня</b>' : 'До встречи — <b>' + n + ' ' + plural(n, 'день', 'дня', 'дней') + '</b>';
    daysEl.hidden = false;
  }

  syncCardShape();

  /* ================= ЗВУК ================= */
  var started = false, opening = false, tipTimer = null;
  function volumeWorks(a) { try { a.volume = 0.5; var ok = Math.abs(a.volume - 0.5) < 0.01; a.volume = 1; return ok; } catch (e) { return false; } }
  function wantSound() { return readSession('vn_sound') !== 'off'; }
  function showTip(text) {
    soundTip.textContent = text; soundTip.className = 'sound-tip show';
    clearTimeout(tipTimer); tipTimer = setTimeout(function () { soundTip.className = 'sound-tip'; }, 1800);
  }
  function renderSound() {
    var on = wantSound();
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', on ? 'Выключить музыку' : 'Включить музыку');
    if (hintEl) hintEl.textContent = on ? 'Нажмите — включится музыка' : 'Нажмите — откроется без музыки';
  }
  renderSound();

  function startMusic() {
    if (!audio || started) return;
    started = true;
    var want = wantSound();
    audio.muted = !want;
    /* плавное нарастание (2,5 с) записано в самом mp3: так оно работает и на iPhone,
       где громкость из скрипта не меняется, и не зависит от requestAnimationFrame,
       который в свёрнутой вкладке не срабатывает и оставлял громкость на нуле */
    if (volumeWorks(audio)) audio.volume = 0.9;
    var p;
    try { p = audio.play(); } catch (e) { p = null; }
    if (p && p.then) p.then(null, function () { started = false; });   /* не вышло — кнопка звука повторит в своём жесте */
  }

  soundBtn.addEventListener('click', function () {
    var on = !wantSound();
    writeSession('vn_sound', on ? 'on' : 'off');
    renderSound();
    if (audio) audio.muted = !on;
    if (!opening) { showTip(on ? 'Откроется с музыкой' : 'Откроется без музыки'); return; }
    showTip(on ? 'Музыка включена' : 'Музыка выключена');
    if (on && audio) {
      if (!started) {                                   /* первый запуск не удался — повторяем в этом же жесте */
        if (audio.error) { try { audio.load(); } catch (e) {} }
        startMusic();
      } else if (audio.paused) {
        try { audio.play().then(null, function () {}); } catch (e) {}
      }
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && started && audio && !audio.muted && audio.paused) { try { audio.play().then(null, function () {}); } catch (e) {} }
  });

  /* ================= ОТКРЫТИЕ ================= */
  function finishOpening() {
    cover.hidden = true;
    cover.className = 'overlay cover';
    card.className = 'card';
    card.removeAttribute('style');
  }

  openBtn.addEventListener('click', function () {
    if (opening) return;
    opening = true;
    startMusic();               /* синхронно в жесте — иначе телефон не даст звук */
    document.body.className = 'locked';
    var p0 = photos[0] || { w: 3, h: 4 };
    var target = printRect(p0.w, p0.h);
    /* подготовить первый отпечаток, невидимый, точно в целевом месте; слой показа пока прозрачный и без блика */
    slideshow.className = 'overlay slideshow priming';
    slideshow.hidden = false;
    printA.className = 'print'; printB.className = 'print';
    printA.querySelector('img').src = p0.src;
    placePrint(printA, target); layoutChrome(target);
    activePrint = printA; current = 0;

    if (quiet) {
      cover.className = 'overlay cover is-opening-quiet';
      setTimeout(function () { printA.className = 'print show'; }, 400);
      setTimeout(function () {
        finishOpening();
        startSlideshow(true);
      }, 1200);
      return;
    }

    /* открытка поднимается на 80 % своей высоты, но не выше верхнего края экрана */
    var cr = card.getBoundingClientRect();
    card.style.setProperty('--rise', Math.max(60, Math.min(cr.height * 0.8, cr.top - 8)) + 'px');
    cover.className = 'overlay cover is-opening';
    var clip = card.parentNode, flipDone = false, swapped = false;

    /* шаг 3: открытка на экране становится первым отпечатком показа */
    function doSwap() {
      if (swapped) return;
      swapped = true;
      printA.style.transition = 'none';
      printA.className = 'print show';
      void printA.offsetWidth;
      finishOpening();
      printA.style.transition = '';
      setTimeout(function () { if (!reduce) printA.className = 'print show zoom'; }, 50);
      startSlideshow(true);
    }
    /* шаг 2 (FLIP): открытка «ложится на стол» — из текущего места в размер отпечатка */
    function doFlip() {
      if (flipDone) return;
      flipDone = true;
      var r = card.getBoundingClientRect();
      clip.style.overflow = 'visible';
      card.style.animation = 'none';
      card.className = 'card flying';
      card.style.left = r.left + 'px'; card.style.top = r.top + 'px';
      card.style.width = r.width + 'px'; card.style.height = r.height + 'px';
      card.style.transform = 'none';
      void card.offsetWidth;
      var sx = target.width / r.width, sy = target.height / r.height;
      card.style.transform = 'translate(' + (target.left - r.left) + 'px,' + (target.top - r.top) + 'px) scale(' + sx + ',' + sy + ')';
      card.addEventListener('transitionend', function onEnd(e) {
        if (e.target !== card) return;
        card.removeEventListener('transitionend', onEnd);
        doSwap();
      });
      setTimeout(doSwap, 950);            /* страховка, если событие не пришло */
    }
    /* шаг 1 заканчивается, когда открытка поднялась (а не по таймеру — на медленном телефоне анимация может отставать) */
    card.addEventListener('animationend', function onRise(e) {
      if (e.animationName !== 'cardRise') return;
      card.removeEventListener('animationend', onRise);
      doFlip();
    });
    setTimeout(doFlip, 2700);             /* страховка: событие не пришло — всё равно идём дальше */
    setTimeout(doSwap, 4200);             /* страховка: старый браузер без анимаций — просто показываем фото */
  });

  /* ================= СТАРТ ================= */
  document.body.className = 'locked';
  preload(1);
  updateDays();
})();
