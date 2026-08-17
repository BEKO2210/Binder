(() => {
  'use strict';

  const canvas = document.querySelector('.hero-art');
  if (!canvas) return;

  const SEED = 22102026;
  const FPS_INTERVAL = 1000 / 28;
  const TAU = Math.PI * 2;
  const ctx = canvas.getContext('2d', { alpha: true });
  const hero = canvas.parentElement;
  const nav = document.querySelector('.home .nav');
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const styles = getComputedStyle(document.documentElement);
  const palette = {
    lime: styles.getPropertyValue('--lime').trim(),
    text: styles.getPropertyValue('--text').trim(),
    muted: styles.getPropertyValue('--muted').trim(),
    line: styles.getPropertyValue('--line').trim()
  };

  let width = 0;
  let height = 0;
  let pageVisible = !document.hidden;
  let heroVisible = true;
  let frameId = 0;
  let previousFrame = -Infinity;
  let animationSeconds = 0;

  function mulberry32(seed) {
    return () => {
      let value = seed += 0x6D2B79F5;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function makeSignals(seed, side) {
    const random = mulberry32(seed);
    return Array.from({ length: 18 }, (_, index) => ({
      index,
      x: side === 0 ? .08 + random() * .38 : .54 + random() * .38,
      y: .08 + random() * .84,
      radius: 9 + random() * 24,
      phase: random() * TAU,
      speed: (.045 + random() * .055) * (random() > .5 ? 1 : -1),
      weight: .65 + random() * .7
    }));
  }

  const left = makeSignals(SEED ^ 0xA511E9B3, 0);
  const right = makeSignals(SEED ^ 0x63D83595, 1);
  const choices = mulberry32(SEED ^ 0xC0A5E17);
  const pairs = left.map((signal, index) => ({
    a: signal,
    b: right[(index * 5 + 3) % right.length],
    choseA: choices() > .36,
    choseB: choices() > .36,
    phase: choices() * TAU,
    period: 11 + choices() * 6,
    offset: choices() * 15
  }));
  const firstMatch = pairs.find(pair => pair.choseA && pair.choseB);
  if (firstMatch) firstMatch.offset = .55;

  function position(signal, seconds) {
    const angle = signal.phase + seconds * signal.speed;
    return {
      x: signal.x * width + Math.cos(angle) * signal.radius,
      y: signal.y * height + Math.sin(angle * 1.17) * signal.radius
    };
  }

  function dot(point, radius, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.fill();
  }

  function curve(a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.bezierCurveTo(
      a.x + (b.x - a.x) * .34, a.y,
      a.x + (b.x - a.x) * .66, b.y,
      b.x, b.y
    );
  }

  function eventStrength(pair, seconds) {
    const age = (seconds + pair.offset) % pair.period;
    if (age < .35) return age / .35;
    if (age < 1.05) return 1;
    if (age < 2.15) return 1 - (age - 1.05) / 1.1;
    return 0;
  }

  function render(seconds) {
    ctx.clearRect(0, 0, width, height);
    if (!width || !height) return;

    const leftPositions = left.map(signal => position(signal, seconds));
    const rightPositions = right.map(signal => position(signal, seconds));

    ctx.lineCap = 'round';
    [...left, ...right].forEach((signal, index) => {
      const point = index < left.length
        ? leftPositions[index]
        : rightPositions[index - left.length];
      dot(point, signal.weight * 1.8, palette.muted, .68);
      dot(point, signal.weight * 5.5, palette.line, .2);
    });

    pairs.forEach(pair => {
      const a = leftPositions[pair.a.index];
      const b = rightPositions[pair.b.index];
      if (pair.choseA !== pair.choseB) {
        const source = pair.choseA ? a : b;
        const target = pair.choseA ? b : a;
        const reach = {
          x: source.x + (target.x - source.x) * .24,
          y: source.y + (target.y - source.y) * .24
        };
        ctx.globalAlpha = .14;
        ctx.strokeStyle = palette.muted;
        ctx.lineWidth = 1;
        curve(source, reach);
        ctx.stroke();
        return;
      }
      if (!pair.choseA) return;

      const strength = eventStrength(pair, seconds);
      if (!strength) return;
      const midpoint = {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
      };

      ctx.save();
      ctx.shadowColor = palette.lime;
      ctx.shadowBlur = 16 * strength;
      ctx.globalAlpha = .2 * strength;
      ctx.strokeStyle = palette.lime;
      ctx.lineWidth = 7;
      curve(a, b);
      ctx.stroke();

      ctx.shadowBlur = 8 * strength;
      ctx.globalAlpha = .92 * strength;
      ctx.strokeStyle = palette.lime;
      ctx.lineWidth = 2.2;
      curve(a, b);
      ctx.stroke();
      ctx.restore();

      dot(midpoint, 3 + strength * 3.5, palette.lime, .9 * strength);
      dot(a, pair.a.weight * 2.4, palette.text, .55 + strength * .4);
      dot(b, pair.b.weight * 2.4, palette.text, .55 + strength * .4);
    });
    ctx.globalAlpha = 1;
  }

  function animate(timestamp) {
    frameId = 0;
    if (!shouldAnimate()) return;
    if (timestamp - previousFrame >= FPS_INTERVAL) {
      previousFrame = timestamp;
      render(animationSeconds);
      animationSeconds += FPS_INTERVAL / 1000;
    }
    frameId = requestAnimationFrame(animate);
  }

  function shouldAnimate() {
    return !motionQuery.matches && pageVisible && heroVisible;
  }

  function syncAnimation() {
    hero.classList.toggle('motion-paused', !shouldAnimate());
    if (shouldAnimate()) {
      if (!frameId) frameId = requestAnimationFrame(animate);
    } else if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function resize() {
    const bounds = hero.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    width = Math.max(1, Math.round(bounds.width));
    height = Math.max(1, Math.round(bounds.height));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    render(motionQuery.matches ? 0 : animationSeconds);
  }

  document.addEventListener('visibilitychange', () => {
    pageVisible = !document.hidden;
    syncAnimation();
  });
  if (nav) {
    const syncNav = () => nav.classList.toggle('nav-scrolled', scrollY > 12);
    addEventListener('scroll', syncNav, { passive: true });
    syncNav();
  }
  motionQuery.addEventListener('change', () => {
    render(0);
    syncAnimation();
  });
  new IntersectionObserver(([entry]) => {
    heroVisible = entry.isIntersecting;
    syncAnimation();
  }).observe(hero);
  new ResizeObserver(resize).observe(hero);
  resize();
  syncAnimation();
})();
