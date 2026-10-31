// 捕獲画面。ポケモンGOのように
//   ・サークルが大きくなったり小さくなったりする
//   ・ボールを上にスワイプして投げる（強さで距離、向きで左右）
//   ・投げる前にくるくる回すとカーブボール
//   ・サークルが小さいときに当てるほど ナイス → グレート → エクセレント
//   ・当たるとボールが最大3回揺れて、捕まえる or 飛び出す（逃げることもある）

import { RARITY, XP, THROW } from './config.js';
import { escapeHtml, JUDGE_LABEL } from './util.js';

const RING_COLORS = { easy: '#3ccf4e', normal: '#f5c400', hard: '#ff4b3e' };

export function openCapture(opts) {
  return new Promise((resolve) => new CaptureScene(opts, resolve));
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (t) => 1 - (1 - t) ** 2;

class CaptureScene {
  constructor({ char, getBalls, useBall, isNew }, done) {
    this.char = char;
    this.rar = RARITY[char.rarity] || RARITY.common;
    this.getBalls = getBalls;
    this.useBall = useBall;
    this.isNew = isNew;
    this.done = done;
    this.closed = false;

    const base = this.rar.baseCatch;
    this.ringColor = base >= 0.4 ? RING_COLORS.easy : base >= 0.2 ? RING_COLORS.normal : RING_COLORS.hard;

    this.root = document.createElement('div');
    this.root.className = 'capture';
    this.root.innerHTML = `
      <canvas></canvas>
      <div class="cap-top">
        <button class="cap-run">にげる</button>
        <div class="cap-name"><b>${escapeHtml(char.name)}</b><span class="rarity r-${char.rarity}">${this.rar.label}</span>${isNew ? '<span class="new">NEW</span>' : ''}</div>
      </div>
      <div class="cap-msg"></div>
      <div class="cap-hint">ボールを上にスワイプして投げよう<br>投げる前にボールをくるくる回すとカーブボール</div>
      <div class="cap-balls">ボール × <b></b></div>`;
    document.body.appendChild(this.root);
    document.getElementById('toast')?.classList.add('hidden'); // ボールに重ならないように消す

    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.msgEl = this.root.querySelector('.cap-msg');
    this.hintEl = this.root.querySelector('.cap-hint');

    this.t0 = performance.now();
    this.state = 'idle';
    this.creature = { action: null, actionStart: 0, nextAction: this.t0 + rand(2500, 4500), alpha: 1, scale: 1 };
    this.popups = [];
    this.particles = [];
    this.result = { judge: null, curve: false };

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
    this.resetBall();

    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    this.canvas.addEventListener('pointermove', (e) => this.move(e));
    this.canvas.addEventListener('pointerup', (e) => this.up(e));
    this.canvas.addEventListener('pointercancel', () => { if (this.state === 'aim') { this.state = 'idle'; this.resetBall(); } });
    this.root.querySelector('.cap-run').addEventListener('click', () => {
      if (['idle', 'aim', 'miss', 'bounce'].includes(this.state)) this.finish({ result: 'ran' });
    });

    this.updateBalls();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    window.__capture = this; // 動作確認用
  }

  // ---------- 画面サイズ ----------
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.R = clamp(Math.min(this.W, this.H) * 0.17, 50, 95); // サークルの最大半径
    this.cx = this.W / 2;
    this.cy = this.H * 0.4;
    this.groundY = this.cy + this.R * 0.95;
    this.restX = this.W / 2;
    this.restY = this.H - 120;
    this.ballR = clamp(this.R * 0.36, 20, 30);
    if (this.ball && this.ball.mode === 'rest') { this.ball.x = this.restX; this.ball.y = this.restY; }
  }

  resetBall() {
    this.ball = { x: this.restX, y: this.restY, scale: 1, rot: 0, mode: 'rest', curve: false, spinAcc: 0, spinDir: 0 };
    this.lastAngle = null;
  }

  updateBalls() {
    this.root.querySelector('.cap-balls b').textContent = this.getBalls();
  }

  msg(text, ms = 1200) {
    this.msgEl.textContent = text;
    this.msgEl.classList.add('show');
    clearTimeout(this.msgTimer);
    if (ms) this.msgTimer = setTimeout(() => this.msgEl.classList.remove('show'), ms);
  }

  // 色付きサークルの今の半径
  ringR(now) {
    const p = ((now - this.t0) % THROW.ringPeriodMs) / THROW.ringPeriodMs;
    return this.R * (0.15 + 0.85 * (0.5 + 0.5 * Math.cos(p * Math.PI * 2)));
  }

  // キャラの今の位置（ジャンプ・攻撃の動き込み）
  creaturePos(now) {
    const c = this.creature;
    let x = this.cx;
    let y = this.cy + Math.sin(now / 420) * 4;
    let s = 1;
    const active = ['idle', 'aim', 'flying', 'miss', 'bounce'].includes(this.state);
    if (c.action) {
      const p = (now - c.actionStart) / 650;
      if (p >= 1) {
        c.action = null;
        c.nextAction = now + rand(2200, 4800);
      } else if (c.action === 'jump') {
        y -= Math.sin(p * Math.PI) * this.R * 0.8;
      } else if (c.action === 'attack') {
        s = 1 + 0.3 * Math.sin(p * Math.PI);
        y += Math.sin(p * Math.PI) * this.R * 0.35;
        x += Math.sin(p * Math.PI * 6) * 4;
      }
    } else if (active && now > c.nextAction) {
      c.action = Math.random() < 0.5 ? 'jump' : 'attack';
      c.actionStart = now;
    }
    return { x, y, s };
  }

  // ---------- 操作 ----------
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
  }

  down(e) {
    if (this.state !== 'idle') return;
    const p = this.point(e);
    if (Math.hypot(p.x - this.ball.x, p.y - this.ball.y) > this.ballR + 45) return;
    if (this.getBalls() <= 0) {
      this.msg('ボールがありません…\nスポットで補充しよう', 2000);
      return;
    }
    this.state = 'aim';
    this.points = [p];
    this.ball.spinAcc = 0;
    this.lastAngle = null;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 無視 */ }
  }

  move(e) {
    if (this.state !== 'aim') return;
    const p = this.point(e);
    this.points.push(p);
    if (this.points.length > 60) this.points.shift();
    this.ball.x = p.x;
    this.ball.y = p.y;

    // ボールを置いていた場所の周りで指を回した角度を数える → カーブ
    const dx = p.x - this.restX;
    const dy = p.y - this.restY;
    const r = Math.hypot(dx, dy);
    if (r > 10 && r < 140) {
      const a = Math.atan2(dy, dx);
      if (this.lastAngle != null) {
        let d = a - this.lastAngle;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        this.ball.spinAcc += d;
      }
      this.lastAngle = a;
    } else {
      this.lastAngle = null;
    }
    if (!this.ball.curve && Math.abs(this.ball.spinAcc) > Math.PI * 2.2) {
      this.ball.curve = true;
      this.ball.spinDir = Math.sign(this.ball.spinAcc);
    }
  }

  up(e) {
    if (this.state !== 'aim') return;
    const end = this.point(e);
    this.points.push(end);
    // 指を上に動かし始めたところ（最大300ミリ秒前まで）から、離したところまでを「投げた動き」とみる
    let i = this.points.length - 1;
    while (i > 0) {
      const cur = this.points[i];
      const prev = this.points[i - 1];
      if (end.t - prev.t > 300) break;
      if (prev.y < cur.y - 2) break; // 下に動いていたところで止める
      i -= 1;
    }
    const start = this.points[i];
    const dt = Math.max(30, end.t - start.t) / 1000;
    const dirX = end.x - start.x;
    const dirY = end.y - start.y;
    const vy = dirY / dt; // 平均の速さ（瞬間の速さより安定する）
    if (dirY > -30 || vy > -200) {
      // 上に投げていない → 元に戻す（カーブは保つ）
      const { curve, spinDir } = this.ball;
      this.state = 'idle';
      this.resetBall();
      this.ball.curve = curve;
      this.ball.spinDir = spinDir;
      return;
    }
    this.throwBall(end, vy, dirX / -dirY);
  }

  // 投げる。
  //   左右：スワイプの向きをまっすぐ延ばした先に飛ぶ（ポケモンGOと同じ感覚）
  //   奥行き：スワイプの速さ。ちょうどいい速さの 0.4〜2.6倍ならキャラの高さに届く（幅を広めに）
  //   カーブ：時計回りなら右、反時計回りなら左に曲がる。逆側に投げると真ん中に来る
  throwBall(p, vy, slope) {
    this.useBall();
    this.updateBalls();
    this.hintEl.classList.add('hidden');
    const now = performance.now();
    const dist = Math.max(60, p.y - this.cy); // 投げた場所からキャラまでの縦の距離(px)
    // ちょうど届く速さ(px/秒)は、ボールの置き場所からキャラまでの距離で決める（指を離した位置によらない）
    const ideal = Math.max(60, this.restY - this.cy) * THROW.idealSpeedPerPx;
    const power = clamp(-vy, 0, 9000) / ideal; // 1 = ちょうど
    // 横のずれは少しだけ真ん中に寄せる（親指のスワイプは斜めになりやすいため）
    const landXStraight = p.x + clamp(slope, -1.5, 1.5) * THROW.aimAssist * dist;
    // 強さは「何倍か」で見る（2倍強いのと半分弱いのが同じくらいのずれになる）
    const lp = Math.log(Math.max(power, 0.05));
    const landY = lp >= 0
      ? this.cy - (lp / Math.log(THROW.powerMax)) * this.R * 1.3
      : this.cy + (lp / Math.log(THROW.powerMin)) * this.R * 1.3;
    const drift = this.ball.curve ? this.ball.spinDir * this.R * THROW.curveDrift : 0;
    this.flight = {
      x0: p.x, y0: p.y, sx: landXStraight, landY, drift, start: now,
      dur: clamp(650 / Math.sqrt(Math.max(power, 0.3)), 450, 950),
      arc: 50 + dist * 0.25,
    };
    this.lastPower = power;
    this.state = 'flying';
    this.ball.mode = 'fly';
  }

  // 動作確認用: power=強さ(1=ちょうど), slope=左右の向き(0=まっすぐ), curve=-1/0/1
  testThrow({ power = 1, slope = 0, curve = 0 } = {}) {
    if (this.state !== 'idle' || this.getBalls() <= 0) return false;
    if (curve) { this.ball.curve = true; this.ball.spinDir = Math.sign(curve); }
    this.throwBall({ x: this.restX, y: this.restY }, -power * Math.max(60, this.restY - this.cy) * THROW.idealSpeedPerPx, slope);
    return true;
  }

  resolveThrow(now) {
    const c = this.creaturePos(now);
    const b = this.ball;
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    const d = Math.hypot(dx, dy);
    const hitR = this.R * 1.15 * c.s;

    if (this.creature.action === 'attack' && d < hitR * 1.3) {
      this.state = 'bounce';
      this.stateStart = now;
      this.bounceFrom = { x: b.x, y: b.y, dir: dx >= 0 ? 1 : -1 };
      this.msg('はじかれた！');
      return;
    }

    if (Math.hypot(dx, dy * 0.85) <= hitR) {
      const rr = this.ringR(now);
      let judge = null;
      let mult = 1;
      if (d <= rr) {
        const f = rr / this.R;
        judge = f > THROW.niceAbove ? 'nice' : f > THROW.greatAbove ? 'great' : 'excellent';
        mult = 1 + (1 - f); // ナイス1.0〜1.3 / グレート1.3〜1.7 / エクセレント1.7〜2.0
      }
      if (b.curve) mult *= THROW.curveMultiplier;
      const chance = 1 - (1 - this.rar.baseCatch) ** mult;
      const caught = Math.random() < chance;
      const shakes = caught ? 3 : Math.floor(Math.random() * 3);
      this.attempt = { judge, curve: b.curve, caught, shakes, chance };
      if (judge) this.popup(`${JUDGE_LABEL[judge]}！`, c.x, c.y - this.R * 1.3, '#fff');
      if (b.curve) this.popup('カーブボール', c.x, c.y - this.R * 1.3 + (judge ? 34 : 0), '#ffe066');
      this.state = 'absorb';
      this.stateStart = now;
      this.absorbAt = { x: c.x, y: c.y };
      b.x = c.x;
      b.y = c.y - this.R * 0.2;
      return;
    }

    this.state = 'miss';
    this.stateStart = now;
    this.missFrom = { x: b.x, y: b.y, vy: dy < 0 ? -1 : 1 };
    this.msg(Math.abs(dx) > hitR ? 'はずれ…' : dy < 0 ? 'とびすぎ！' : 'とどかない…');
  }

  backToIdle(now) {
    this.state = 'idle';
    this.resetBall();
    this.creature.nextAction = now + rand(1500, 3500);
    if (this.getBalls() <= 0) this.msg('ボールがなくなった…\n「にげる」で地図に戻ろう', 0);
  }

  popup(text, x, y, color) {
    this.popups.push({ text, x, y, color, start: performance.now() });
  }

  burst(x, y, color, n = 18) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(80, 260);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0, max: rand(0.5, 1), color });
    }
  }

  // ---------- 毎フレームの処理 ----------
  loop(now) {
    if (this.closed) return;
    this.update(now);
    this.draw(now);
    this.raf = requestAnimationFrame(this.loop);
  }

  update(now) {
    const b = this.ball;
    const cr = this.creature;
    const el = (now - (this.stateStart || now)) / 1000;

    switch (this.state) {
      case 'idle':
        if (b.mode === 'rest') { b.x = this.restX; b.y = this.restY + Math.sin(now / 300) * 2; }
        if (b.curve) b.rot += 0.2 * b.spinDir;
        break;
      case 'aim':
        if (b.curve) b.rot += 0.3 * b.spinDir;
        break;
      case 'flying': {
        const f = this.flight;
        const t = Math.min(1, (now - f.start) / f.dur);
        b.x = f.x0 + (f.sx - f.x0) * t + f.drift * t * t;
        b.y = f.y0 + (f.landY - f.y0) * t - f.arc * Math.sin(Math.PI * t);
        b.scale = 1 - 0.45 * t;
        b.rot += b.curve ? 0.35 * b.spinDir : 0.15;
        if (t >= 1) this.resolveThrow(now);
        break;
      }
      case 'miss': {
        const m = this.missFrom;
        b.y = m.y + (m.vy < 0 ? -1 : 1) * 200 * el + 600 * el * el * (m.vy < 0 ? 0.3 : 1);
        b.scale = Math.max(0.2, 0.55 - el * 0.3);
        if (el > 0.7) this.backToIdle(now);
        break;
      }
      case 'bounce': {
        const m = this.bounceFrom;
        b.x = m.x + m.dir * 260 * el;
        b.y = m.y - 200 * el + 700 * el * el;
        b.rot += 0.4;
        if (el > 0.7) this.backToIdle(now);
        break;
      }
      case 'absorb': // キャラがボールに吸い込まれる
        cr.alpha = Math.max(0, 1 - el / 0.45);
        cr.scale = Math.max(0, 1 - el / 0.45);
        if (el > 0.5) { this.state = 'drop'; this.stateStart = now; }
        break;
      case 'drop': { // ボールが地面に落ちる
        const t = Math.min(1, el / 0.4);
        b.y = this.absorbAt.y - this.R * 0.2 + (this.groundY - this.ballR * 0.5 - (this.absorbAt.y - this.R * 0.2)) * easeOut(t);
        b.rot = 0;
        if (t >= 1) { this.state = 'shake'; this.stateStart = now; this.shakeIndex = 0; }
        break;
      }
      case 'shake': {
        const per = 0.95;
        const i = Math.floor(el / per);
        const p = (el % per) / per;
        if (i >= this.attempt.shakes) {
          this.stateStart = now;
          if (this.attempt.caught) {
            this.state = 'caught';
            this.burst(b.x, b.y, '#ffe066', 26);
            this.msg('つかまえた！', 0);
          } else {
            this.state = 'breakout';
            this.burst(b.x, b.y, '#ffffff', 14);
          }
          b.rot = 0;
        } else {
          b.rot = p < 0.55 ? Math.sin((p / 0.55) * Math.PI * 2) * 0.45 : 0;
        }
        break;
      }
      case 'breakout': // ボールから飛び出す
        cr.alpha = Math.min(1, el / 0.3);
        cr.scale = Math.min(1, el / 0.3);
        if (el > 0.45) {
          if (Math.random() < this.rar.flee) {
            this.state = 'flee';
            this.stateStart = now;
            this.msg('にげられた…', 0);
          } else {
            this.msg('あぁっ！ でてきた！');
            this.backToIdle(now);
          }
        }
        break;
      case 'flee':
        cr.alpha = Math.max(0, 1 - el / 0.8);
        if (el > 1.4) this.finish({ result: 'fled' });
        break;
      case 'caught':
        if (el > 1.8) this.finish({ result: 'caught' });
        break;
      default:
        break;
    }

    // 粒子
    const dt = 1 / 60;
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      return p.life < p.max;
    });
  }

  draw(now) {
    const { ctx, W, H } = this;
    // 背景
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#9fdcff');
    sky.addColorStop(0.5, '#e6f7ff');
    sky.addColorStop(0.5, '#a6dd73');
    sky.addColorStop(1, '#5fae3f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const c = this.creaturePos(now);
    const cr = this.creature;

    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(this.cx, this.groundY, this.R * 0.9, this.R * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // キャラ
    if (cr.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = cr.alpha;
      ctx.translate(c.x, c.y);
      ctx.scale(c.s * cr.scale, c.s * cr.scale);
      ctx.font = `${Math.round(this.R * 1.45)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000'; // 絵文字が半透明にならないように
      ctx.fillText(this.char.emoji, 0, 0);
      ctx.restore();
    }

    // サークル
    if (['idle', 'aim', 'flying', 'miss', 'bounce'].includes(this.state)) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, this.R * c.s, 0, Math.PI * 2);
      ctx.stroke();
      const rr = this.ringR(now) * c.s;
      ctx.lineWidth = 5;
      ctx.strokeStyle = this.ringColor;
      ctx.fillStyle = `${this.ringColor}22`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 吸い込みの光
    if (this.state === 'absorb') {
      const el = (now - this.stateStart) / 500;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 0.8 - el)})`;
      ctx.beginPath();
      ctx.arc(this.absorbAt.x, this.absorbAt.y, this.R * (0.6 + el), 0, Math.PI * 2);
      ctx.fill();
    }

    // ボール
    const b = this.ball;
    const showBall = !(this.state === 'breakout' || this.state === 'flee') && !(this.state === 'idle' && this.getBalls() <= 0);
    if (showBall) {
      drawBall(ctx, b.x, b.y, this.ballR * b.scale, b.rot, b.curve);
      if (b.curve && ['idle', 'aim', 'flying'].includes(this.state)) {
        for (let i = 0; i < 3; i++) {
          const a = now / 150 + (i * Math.PI * 2) / 3;
          ctx.fillStyle = '#fff6a8';
          ctx.beginPath();
          ctx.arc(b.x + Math.cos(a) * this.ballR * b.scale * 1.4, b.y + Math.sin(a) * this.ballR * b.scale * 1.4, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 粒子
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 判定の文字
    this.popups = this.popups.filter((p) => now - p.start < 1200);
    for (const p of this.popups) {
      const t = (now - p.start) / 1200;
      ctx.globalAlpha = 1 - t;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeText(p.text, p.x, p.y - t * 40);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - t * 40);
    }
    ctx.globalAlpha = 1;
  }

  finish({ result }) {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    clearTimeout(this.msgTimer);
    this.root.remove();
    if (window.__capture === this) delete window.__capture;
    const a = this.attempt || {};
    let xp = 0;
    if (result === 'caught') {
      xp = XP.catch + (this.isNew ? XP.newSpecies : 0) + (a.judge ? XP[a.judge] : 0) + (a.curve ? XP.curve : 0);
    }
    this.done({ result, judge: a.judge || null, curve: !!a.curve, xp });
  }
}

// オリジナルデザインのボール（青緑と白、金色の帯）
export function drawBall(ctx, x, y, r, rot = 0, glow = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  if (glow) { ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 22; }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#1fb5a5';
  ctx.fillRect(-r, -r, r * 2, r);
  ctx.fillStyle = '#f2b705';
  ctx.fillRect(-r, -r * 0.11, r * 2, r * 0.22);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = '#f2b705';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.restore();
}
