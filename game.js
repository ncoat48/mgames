// ============================================================
//  METRO DASH — game.js
//  All game logic, multiplayer, and UI interactions
// ============================================================

// ─── FIREBASE CONFIG ─────────────────────────────────────────────
/* PASTE YOUR FIREBASE CONFIG HERE */
const firebaseConfig = {
  apiKey: "AIzaSyDA-6mcWk1IyT5U2GjuaRm-TgSLG4Atl4Y",
  authDomain: "webtest-9ad2f.firebaseapp.com",
  databaseURL: "https://webtest-9ad2f-default-rtdb.firebaseio.com",
  projectId: "webtest-9ad2f",
  storageBucket: "webtest-9ad2f.firebasestorage.app",
  messagingSenderId: "527281937367",
  appId: "1:527281937367:web:2ac42502fdfb417888c992"
};
// ─────────────────────────────────────────────────────────────────

const REWARD_SCORE_THRESHOLD = 10000;

// ─── BOOT ─────────────────────────────────────────────────────────
const IS_PLACEHOLDER = firebaseConfig.apiKey === "REPLACE_ME";

if (IS_PLACEHOLDER) {
  showScreen('setup');
} else {
  firebase.initializeApp(firebaseConfig);
  const db = window._db = firebase.database();
  showScreen('lobby');
  initGame(db);
}

// ─── AMBIENT PARTICLES ────────────────────────────────────────────
(function spawnAmbientParticles() {
  const container = document.getElementById('particles');
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left   = Math.random() * 100 + '%';
    p.style.animationDuration  = (7 + Math.random() * 11) + 's';
    p.style.animationDelay     = (Math.random() * 12) + 's';
    const sz = (1 + Math.random() * 2.5) + 'px';
    p.style.width  = sz;
    p.style.height = sz;
    if (Math.random() > .55) p.style.background = '#ff3c6e';
    if (Math.random() > .80) p.style.background = '#ffd700';
    container.appendChild(p);
  }
})();

// ─── MAIN GAME INIT ───────────────────────────────────────────────
function initGame(db) {

  // Constants
  const BATCH_MAX  = 5;
  const BATCH_MIN  = 3;
  const CD_SECS    = 5;

  // State
  let myId    = null, myName   = null, myBatchId = null;
  let myScore = 0,    myLives  = 3;
  let gameRunning = false, gameOver = false;
  let countingDown = false, cdVal = 0, cdInt = null;
  let batchRef = null, playerRef = null;
  let canvas, ctx, animFrame, scorePushInt;
  let gs = {};
  let touchX, touchY;
  let lastSpeedLevel = 0;

  // ── JOIN ──────────────────────────────────────────────────────────
  async function joinGame() {
    const raw = document.getElementById('playerName').value.trim();
    if (!raw) { toast('Enter your name first!'); return; }
    myName = raw.toUpperCase().slice(0, 16);
    myId   = 'p' + Date.now() + Math.random().toString(36).slice(2, 5);
    try {
      await assignBatch();
      showScreen('waiting');
      listenBatch();
    } catch (e) {
      toast('Connection error: ' + e.message);
    }
  }
  window.joinGame = joinGame;

  // ── BATCH ASSIGNMENT ──────────────────────────────────────────────
  async function assignBatch() {
    const snap    = await db.ref('batches').once('value');
    const batches = snap.val() || {};
    let found     = null;

    for (const [bid, b] of Object.entries(batches)) {
      if (b.started || b.finished) continue;
      if (Object.keys(b.players || {}).length < BATCH_MAX) {
        found = bid;
        break;
      }
    }

    if (!found) {
      found = 'b' + Date.now();
      await db.ref('batches/' + found).set({
        started: false, finished: false,
        players: {}, createdAt: Date.now()
      });
    }

    myBatchId = found;
    batchRef  = db.ref('batches/' + myBatchId);
    playerRef = db.ref('batches/' + myBatchId + '/players/' + myId);

    await playerRef.set({ name: myName, score: 0, lives: 3, alive: true, finished: false });
    playerRef.onDisconnect().remove();
  }

  // ── LISTEN BATCH ──────────────────────────────────────────────────
  function listenBatch() {
    batchRef.on('value', snap => {
      const b = snap.val(); if (!b) return;
      const players = b.players || {};
      const count   = Object.keys(players).length;

      updateWaitUI(players, count);

      if (b.started && !gameRunning && !gameOver) {
        batchRef.off();
        startGame();
        return;
      }

      if (!b.started && count >= BATCH_MIN && !countingDown) {
        countingDown = true;
        startCD();
      }

      if (!b.started && count < BATCH_MIN && countingDown) {
        countingDown = false;
        clearInterval(cdInt);
        document.getElementById('cntBar').style.display  = 'none';
        document.getElementById('cntText').style.display = 'none';
        document.getElementById('waitMsg').textContent   = 'Need at least 3 players to start';
      }
    });
  }

  function updateWaitUI(players, count) {
    document.getElementById('batchInfo').textContent =
      `BATCH · ${count} / ${BATCH_MIN} MIN PLAYERS`;

    const el = document.getElementById('playerListEl');
    if (!count) {
      el.innerHTML = '<div class="wait-msg">Waiting for players to join…</div>';
      return;
    }

    el.innerHTML = Object.entries(players).map(([pid, p]) => {
      const isMe = pid === myId;
      const dot  = isMe ? 'style="background:var(--gold);box-shadow:0 0 8px var(--gold)"' : '';
      const you  = isMe ? ' <span class="text-dim" style="font-size:.6rem">(you)</span>' : '';
      return `<div class="player-chip">
        <div class="pdot" ${dot}></div>
        <span style="font-size:.85rem">${p.name}${you}</span>
      </div>`;
    }).join('');
  }

  // ── COUNTDOWN ─────────────────────────────────────────────────────
  function startCD() {
    document.getElementById('waitMsg').textContent   = 'Enough players! Starting soon…';
    document.getElementById('cntBar').style.display  = 'block';
    document.getElementById('cntText').style.display = 'block';
    cdVal = CD_SECS;
    updateCDDisplay();

    cdInt = setInterval(async () => {
      cdVal--;
      updateCDDisplay();
      if (cdVal <= 0) {
        clearInterval(cdInt);
        const snap = await batchRef.once('value');
        if (!snap.val()?.started) {
          await batchRef.update({ started: true, startedAt: Date.now() });
        }
      }
    }, 1000);
  }

  function updateCDDisplay() {
    const cntText = document.getElementById('cntText');
    const cntFill = document.getElementById('cntFill');
    // Re-trigger animation by cloning
    const clone = cntText.cloneNode(true);
    clone.textContent = cdVal || 'GO!';
    cntText.parentNode.replaceChild(clone, cntText);
    cntFill.style.width = ((cdVal / CD_SECS) * 100) + '%';
  }

  // ── START GAME ────────────────────────────────────────────────────
  function startGame() {
    if (gameRunning) return;
    gameRunning = true;
    showScreen('game-screen');

    canvas = document.getElementById('gameCanvas');
    ctx    = canvas.getContext('2d');

    resizeCv();
    window.addEventListener('resize', resizeCv);

    initGS();
    bindCtrl();
    loop();

    scorePushInt = setInterval(pushScore, 1500);

    batchRef.on('value', snap => {
      const b = snap.val(); if (!b) return;
      const players = b.players || {};
      const alive   = Object.values(players).filter(p => p.alive).length;
      document.getElementById('aliveCount').textContent = alive;

      if (b.finished) {
        batchRef.off();
        if (gameRunning) { gameRunning = false; cancelAnimationFrame(animFrame); }
        showResults(players);
      }

      if (gameOver) updateElimLB(players);
    });
  }

  // ── CANVAS RESIZE ─────────────────────────────────────────────────
  function resizeCv() {
    const maxW = Math.min(window.innerWidth, 500);
    // Reserve: HUD header (~48px) + swipe hint (~20px) + mobile controls (~0-68px)
    const mobileCtrl = window.matchMedia('(pointer:coarse)').matches ? 68 : 0;
    const maxH = Math.min(window.innerHeight - 68 - mobileCtrl, 900);
    canvas.width  = maxW;
    canvas.height = Math.max(maxH, 340);
    if (gs.W) {
      // Recompute positions on resize
      gs.W = canvas.width;
      gs.H = canvas.height;
      gs.lW = gs.W / 3;
      gs.lanes = [gs.lW * .5, gs.lW * 1.5, gs.lW * 2.5];
      gs.targetX = gs.lanes[gs.lane];
      gs.px = gs.targetX;
      gs.py = gs.H * .72;
      gs.pW = gs.lW * .42;
      gs.pH = gs.lW * .42;
    }
  }

  // ── GAME STATE INIT ───────────────────────────────────────────────
  function initGS() {
    const W = canvas.width, H = canvas.height, lW = W / 3;
    gs = {
      W, H, lW,
      lanes:    [lW * .5, lW * 1.5, lW * 2.5],
      lane:     1,
      targetX:  lW * 1.5,
      px:       lW * 1.5,
      py:       H * .80,
      pW:       lW * .42,
      pH:       lW * .42,
      jumping:  false,
      sliding:  false,
      jumpY:    0,
      jumpVel:  0,
      score:    0,
      lives:    3,
      speed:    4,
      obs:      [],
      coins:    [],
      parts:    [],
      bgOff:    0,
      fr:       0,
      inv:      0,
      lastO:    0,
      lastC:    0,
      alive:    true,
      slideT:   0,
      bgLines:  [],
      shake:    0,
    };

    // Generate background track marks
    for (let i = 0; i < 20; i++) {
      gs.bgLines.push({ y: Math.random() * gs.H });
    }

    myScore = 0; myLives = 3; lastSpeedLevel = 0;
    updateHUD();
    document.getElementById('scoreDisplay').textContent = '0';
  }

  // ── GAME LOOP ─────────────────────────────────────────────────────
  function loop() {
    if (!gameRunning) return;
    animFrame = requestAnimationFrame(loop);
    if (!gs.alive) return;

    gs.fr++;
    gs.score++;
    const newSpeedLevel = Math.floor(gs.score / 250);
    gs.speed = 4 + newSpeedLevel * .4;

    // Announce speed increase
    if (newSpeedLevel > lastSpeedLevel) {
      lastSpeedLevel = newSpeedLevel;
      flashSpeedUp();
    }

    // Smooth lane transition
    gs.px += (gs.targetX - gs.px) * .2;

    // Jump physics
    if (gs.jumping) {
      gs.jumpVel += .65;
      gs.jumpY   += gs.jumpVel;
      if (gs.jumpY >= 0) {
        gs.jumpY   = 0;
        gs.jumping = false;
        gs.jumpVel = 0;
        // Landing particles
        burst(gs.px, gs.py, '#00ffcc44', 6, 1.5);
      }
    }

    // Slide timer
    if (gs.sliding) {
      gs.slideT--;
      if (gs.slideT <= 0) gs.sliding = false;
    }

    // Screen shake decay
    if (gs.shake > 0) gs.shake *= .85;

    // Background scroll
    gs.bgOff = (gs.bgOff + gs.speed) % 60;

    // Scroll bg track lines
    for (const l of gs.bgLines) {
      l.y += gs.speed * .3;
      if (l.y > gs.H) l.y = -5;
    }

    // Spawn obstacles
    const obsGap = Math.max(50, 90 - gs.score / 120);
    if (gs.fr - gs.lastO > obsGap) { spawnObs(); gs.lastO = gs.fr; }

    // Spawn coins
    if (gs.fr - gs.lastC > 30) { spawnCoin(); gs.lastC = gs.fr; }

    // Move + filter obstacles
    gs.obs = gs.obs.filter(o => {
      o.y += gs.speed;
      return o.y < gs.H + 80;
    });

    // Move + filter coins (with pickup check)
    gs.coins = gs.coins.filter(c => {
      c.y += gs.speed;
      c.pulse = ((c.pulse || 0) + .1) % (Math.PI * 2);
      if (hitCoin(c)) {
        gs.score += 50;
        burst(c.x, c.y, '#ffd700', 10, 3);
        return false;
      }
      return c.y < gs.H + 40;
    });

    // Collision detection (with invincibility)
    if (gs.inv > 0) {
      gs.inv--;
    } else {
      for (const o of gs.obs) {
        if (hitObs(o)) {
          gs.lives--;
          gs.inv   = 80;
          gs.shake = 12;
          burst(gs.px, gs.py + gs.jumpY, '#ff3c6e', 16, 5);
          if (gs.lives <= 0) {
            endGame();
            return;
          }
          updateHUD();
          break;
        }
      }
    }

    // Update particles
    gs.parts = gs.parts.filter(p => {
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   += .12;
      p.life--;
      return p.life > 0;
    });

    // Sync score
    myScore = gs.score;
    myLives = gs.lives;
    document.getElementById('scoreDisplay').textContent = gs.score;

    draw();
  }

  function flashSpeedUp() {
    const el = document.createElement('div');
    el.textContent = '⚡ SPEED UP!';
    el.style.cssText = `
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      font-family:'Bebas Neue',sans-serif; font-size:2rem;
      color:var(--hot); text-shadow:0 0 20px #ff3c6e;
      pointer-events:none; z-index:100;
      animation:speedFlash .8s ease forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  // ── SPAWN HELPERS ─────────────────────────────────────────────────
  function spawnObs() {
    const type  = Math.random() < .5 ? 'train' : 'barrier';
    const lanes = [Math.floor(Math.random() * 3)];
    // Double-lane obstacle at higher speeds
    if (gs.speed > 5.5 && Math.random() < .28) {
      lanes.push((lanes[0] + 1) % 3);
    }
    for (const l of lanes) {
      const isB = type === 'barrier';
      gs.obs.push({
        lane:  l,
        x:     gs.lanes[l],
        y:     -70,
        w:     gs.lW * .55,
        h:     isB ? gs.lW * .28 : gs.lW * .55,
        type,
        isLow: isB,
        wobble: 0,
      });
    }
  }

  function spawnCoin() {
    const l = Math.floor(Math.random() * 3);
    // Coins in a zigzag or line pattern
    const pattern = Math.random() < .4 ? 'zigzag' : 'line';
    for (let i = 0; i < 4; i++) {
      const laneOffset = pattern === 'zigzag' ? (i % 2 === 0 ? 0 : 1) : 0;
      const coinLane   = (l + laneOffset) % 3;
      gs.coins.push({
        x: gs.lanes[coinLane],
        y: -40 - i * 38,
        r: 10,
        pulse: i * .5,
      });
    }
  }

  // ── COLLISION ─────────────────────────────────────────────────────
  function hitObs(o) {
    const px = gs.px;
    const py = gs.py + gs.jumpY;
    const ph = gs.sliding ? gs.pH * .5 : gs.pH;

    // Can jump over barriers if high enough
    if (o.isLow && gs.jumping && gs.jumpY < -(o.h * .6)) return false;
    // Can slide under barriers
    if (o.isLow && gs.sliding) return false;

    const xOk = Math.abs(px - o.x) < (gs.pW * .38 + o.w * .38);
    const yOk = (py - ph) < o.y && py > (o.y - o.h);
    return xOk && yOk;
  }

  function hitCoin(c) {
    return (
      Math.abs(gs.px - c.x) < gs.lW * .36 &&
      Math.abs((gs.py + gs.jumpY) - c.y) < 28
    );
  }

  function burst(x, y, col, count = 12, speed = 4) {
    for (let i = 0; i < count; i++) {
      gs.parts.push({
        x, y,
        vx:    (Math.random() - .5) * speed,
        vy:    (Math.random() - .8) * speed,
        life:  28 + Math.random() * 22,
        color: col,
        r:     1.5 + Math.random() * 3,
      });
    }
  }

  // ── DRAW ──────────────────────────────────────────────────────────
  function draw() {
    const { W, H, lW } = gs;

    ctx.save();

    // Screen shake
    if (gs.shake > .5) {
      const sx = (Math.random() - .5) * gs.shake;
      const sy = (Math.random() - .5) * gs.shake;
      ctx.translate(sx, sy);
    }

    // Clear
    ctx.clearRect(-20, -20, W + 40, H + 40);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0a0a14');
    bgGrad.addColorStop(1, '#0d0d1a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Vertical lane dividers
    ctx.strokeStyle = '#161626';
    ctx.lineWidth = 2;
    for (let x = lW; x < W; x += lW) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }

    // Dashed center lane guides
    ctx.strokeStyle = '#20203a';
    ctx.lineWidth = 2;
    ctx.setLineDash([18, 36]);
    ctx.lineDashOffset = -gs.bgOff;
    for (let l = 0; l < 3; l++) {
      ctx.beginPath();
      ctx.moveTo(gs.lanes[l], 0);
      ctx.lineTo(gs.lanes[l], H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Background speed lines
    ctx.globalAlpha = .06;
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 1;
    for (const ln of gs.bgLines) {
      ctx.beginPath();
      ctx.moveTo(0, ln.y);
      ctx.lineTo(W, ln.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Ground line
    ctx.fillStyle = '#1a1a30';
    ctx.fillRect(0, H - 5, W, 5);

    // ── COINS ──
    for (const c of gs.coins) {
      const pulse = Math.sin(c.pulse) * 2;
      ctx.save();
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur  = 12 + pulse;
      // Outer ring
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth   = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r + 2, 0, Math.PI * 2);
      ctx.stroke();
      // Fill
      const cg = ctx.createRadialGradient(c.x - 2, c.y - 2, 1, c.x, c.y, c.r);
      cg.addColorStop(0, '#fff5aa');
      cg.addColorStop(1, '#ffaa00');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── OBSTACLES ──
    for (const o of gs.obs) {
      ctx.save();
      const x = o.x - o.w / 2;
      const y = o.y - o.h;

      if (o.type === 'train') {
        // Train body
        ctx.shadowColor = '#ff3c6e';
        ctx.shadowBlur  = 18;
        const tg = ctx.createLinearGradient(x, y, x + o.w, y);
        tg.addColorStop(0, '#cc1a44');
        tg.addColorStop(.5, '#ff3c6e');
        tg.addColorStop(1, '#cc1a44');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.roundRect(x, y, o.w, o.h, 5);
        ctx.fill();
        // Window strip
        ctx.fillStyle = 'rgba(255,180,180,.25)';
        ctx.fillRect(x + 5, y + 6, o.w - 10, o.h * .28);
        // Front light
        ctx.shadowColor = '#ffaa00';
        ctx.shadowBlur  = 12;
        ctx.fillStyle   = '#ffee88';
        ctx.beginPath();
        ctx.arc(o.x, o.y - 6, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Barrier
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur  = 14;
        const bg = ctx.createLinearGradient(x, y, x + o.w, y);
        bg.addColorStop(0, '#b59a00');
        bg.addColorStop(.5, '#ffd700');
        bg.addColorStop(1, '#b59a00');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(x, y, o.w, o.h, 4);
        ctx.fill();
        // Warning stripe
        ctx.fillStyle = '#ff3c6e';
        const stripeH = o.h * .3;
        ctx.fillRect(x, y + o.h * .35, o.w, stripeH);
        // Stripe pattern
        ctx.globalAlpha = .4;
        ctx.fillStyle = '#000';
        for (let s = 0; s < 5; s++) {
          ctx.fillRect(x + s * (o.w / 5), y + o.h * .35, o.w / 10, stripeH);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    // ── PARTICLES ──
    for (const p of gs.parts) {
      ctx.save();
      ctx.globalAlpha = (p.life / 50) * .9;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── PLAYER ──
    {
      const ph  = gs.sliding ? gs.pH * .5 : gs.pH;
      const pw  = gs.sliding ? gs.pW * 1.35 : gs.pW;
      const so  = gs.sliding ? gs.pH * .25 : 0;
      const py  = gs.py + gs.jumpY;

      ctx.save();

      // Invincibility blink
      if (gs.inv > 0 && Math.floor(gs.inv / 5) % 2 === 0) {
        ctx.globalAlpha = .35;
      }

      // Shadow / ground shadow
      if (!gs.jumping || gs.jumpY > -20) {
        ctx.globalAlpha *= .3;
        ctx.fillStyle = '#00ffcc';
        ctx.beginPath();
        ctx.ellipse(gs.px, gs.py + 2, pw * .45, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = gs.inv > 0 && Math.floor(gs.inv / 5) % 2 === 0 ? .35 : 1;
      }

      // Body glow
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur  = 24;

      // Body gradient
      const pg = ctx.createLinearGradient(gs.px - pw / 2, py - ph + so, gs.px + pw / 2, py + so);
      pg.addColorStop(0, '#44ffdd');
      pg.addColorStop(1, '#00cc99');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.roundRect(gs.px - pw / 2, py - ph + so, pw, ph, gs.sliding ? 5 : 8);
      ctx.fill();

      // Eyes (only when not sliding)
      if (!gs.sliding) {
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#001a14';
        ctx.beginPath();
        ctx.arc(gs.px - pw * .2, py - ph * .65, 3.5, 0, Math.PI * 2);
        ctx.arc(gs.px + pw * .2, py - ph * .65, 3.5, 0, Math.PI * 2);
        ctx.fill();
        // Eye shine
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.beginPath();
        ctx.arc(gs.px - pw * .2 + 1, py - ph * .65 - 1, 1.2, 0, Math.PI * 2);
        ctx.arc(gs.px + pw * .2 + 1, py - ph * .65 - 1, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.restore(); // end shake transform
  }

  // ── HUD UPDATE ────────────────────────────────────────────────────
  function updateHUD() {
    document.querySelectorAll('.heart').forEach((h, i) => {
      h.classList.toggle('lost', i >= myLives);
    });
  }

  // ── CONTROLS ──────────────────────────────────────────────────────
  function bindCtrl() {
    // Touch swipe
    canvas.addEventListener('touchstart', e => {
      touchX = e.touches[0].clientX;
      touchY = e.touches[0].clientY;
    }, { passive: true });

    canvas.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchX;
      const dy = e.changedTouches[0].clientY - touchY;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx < -20) move(-1);
        else if (dx > 20) move(1);
      } else {
        if (dy < -20) jump();
        else if (dy > 20) slide();
      }
    }, { passive: true });

    // Tap zones (desktop click)
    canvas.addEventListener('click', e => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const W = canvas.width;
      if (x < W / 3) move(-1);
      else if (x > W * 2 / 3) move(1);
      else jump();
    });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (['ArrowLeft',  'a', 'A'].includes(e.key)) { e.preventDefault(); move(-1); }
      if (['ArrowRight', 'd', 'D'].includes(e.key)) { e.preventDefault(); move(1); }
      if (['ArrowUp',    'w', 'W', ' '].includes(e.key)) { e.preventDefault(); jump(); }
      if (['ArrowDown',  's', 'S'].includes(e.key)) { e.preventDefault(); slide(); }
    });

    // Mobile button controls
    const btnLeft  = document.getElementById('ctrlLeft');
    const btnRight = document.getElementById('ctrlRight');
    const btnJump  = document.getElementById('ctrlJump');
    const btnSlide = document.getElementById('ctrlSlide');

    if (btnLeft)  btnLeft .addEventListener('touchstart',  () => move(-1), { passive: true });
    if (btnRight) btnRight.addEventListener('touchstart',  () => move(1),  { passive: true });
    if (btnJump)  btnJump .addEventListener('touchstart',  () => jump(),   { passive: true });
    if (btnSlide) btnSlide.addEventListener('touchstart',  () => slide(),  { passive: true });
    if (btnLeft)  btnLeft .addEventListener('click', () => move(-1));
    if (btnRight) btnRight.addEventListener('click', () => move(1));
    if (btnJump)  btnJump .addEventListener('click', () => jump());
    if (btnSlide) btnSlide.addEventListener('click', () => slide());
  }

  function move(d)  { gs.lane = Math.max(0, Math.min(2, gs.lane + d)); gs.targetX = gs.lanes[gs.lane]; }
  function jump()   { if (!gs.jumping) { gs.jumping = true; gs.jumpVel = -14; } }
  function slide()  { if (!gs.sliding && !gs.jumping) { gs.sliding = true; gs.slideT = 48; } }

  // ── PUSH SCORE ────────────────────────────────────────────────────
  async function pushScore() {
    if (!playerRef) return;
    try {
      await playerRef.update({
        score:    myScore,
        lives:    myLives,
        alive:    gs.alive !== false,
        finished: gameOver,
      });
    } catch (_) { /* silent fail */ }
  }

  // ── END GAME ──────────────────────────────────────────────────────
  async function endGame() {
    gameRunning = false;
    gameOver    = true;
    gs.alive    = false;
    cancelAnimationFrame(animFrame);
    clearInterval(scorePushInt);
    await pushScore();

    document.getElementById('elimScore').textContent = myScore.toLocaleString();
    showScreen('eliminated-screen');

    const snap = await batchRef.once('value');
    const b    = snap.val();
    const ps   = b?.players || {};
    if (Object.values(ps).every(p => !p.alive || p.finished)) {
      await batchRef.update({ finished: true });
    }
  }

  // ── LEADERBOARDS ─────────────────────────────────────────────────
  function updateElimLB(players) {
    const rows = Object.entries(players)
      .map(([pid, p]) => ({ ...p, isMe: pid === myId }))
      .sort((a, b) => b.score - a.score);

    document.getElementById('elimLeaderboard').innerHTML =
      `<div style="font-size:.58rem;letter-spacing:.2em;color:#445;text-transform:uppercase;margin-bottom:8px">Live Scores</div>` +
      rows.map(p =>
        `<div class="elim-row">
          <span style="color:${p.alive ? 'var(--neon)' : '#334'}">${p.name}${p.isMe ? ' <span style="color:#445;font-size:.58rem">(you)</span>' : ''}</span>
          <span style="font-family:'Bebas Neue';font-size:1.1rem;color:var(--gold)">${p.score.toLocaleString()}</span>
        </div>`
      ).join('');
  }

  function showResults(players) {
    const rows = Object.entries(players)
      .map(([pid, p]) => ({ ...p, isMe: pid === myId }))
      .sort((a, b) => b.score - a.score);

    if (rows[0]?.isMe) {
      document.getElementById('winnerNameDisplay').textContent  = rows[0].name;
      document.getElementById('winnerScoreDisplay').textContent = myScore.toLocaleString();

      if (myScore >= REWARD_SCORE_THRESHOLD) {
        document.getElementById('rewardUnlocked').style.display = 'block';
        document.getElementById('rewardLocked').style.display   = 'none';
      } else {
        document.getElementById('rewardLocked').style.display   = 'block';
        document.getElementById('rewardUnlocked').style.display = 'none';
        document.getElementById('lockedScoreDisplay').textContent = myScore.toLocaleString();
      }

      showScreen('winner-screen');
      launchConfetti();
    } else {
      buildLB(rows);
      showScreen('leaderboard');
    }
  }

  function buildLB(rows) {
    const medals = ['🥇', '🥈', '🥉'];
    document.getElementById('lbList').innerHTML = rows.map((p, i) =>
      `<div class="lb-row">
        <div class="lb-rank">${medals[i] || (i + 1)}</div>
        <div class="lb-name">${p.name}${p.isMe ? ' <span class="text-dim" style="font-size:.58rem">(you)</span>' : ''}</div>
        <div class="lb-score">${p.score.toLocaleString()}</div>
      </div>`
    ).join('');
  }

  // ── SUBMIT PHONE ──────────────────────────────────────────────────
  async function submitPhone() {
    const phone   = document.getElementById('phoneInput').value.trim();
    const btn     = document.getElementById('submitBtn');
    const sentMsg = document.getElementById('sentMsg');

    if (!phone || phone.length < 7) { toast('Enter a valid phone number!'); return; }
    if (myScore < REWARD_SCORE_THRESHOLD) { toast('Score too low to claim reward!'); return; }

    btn.disabled    = true;
    btn.textContent = 'SENDING…';

    try {
      await db.ref('winner_claims').push({
        name:  myName,
        phone,
        batch: myBatchId,
        score: myScore,
        time:  new Date().toISOString(),
      });

      await emailjs.send('service_xd6pzog', 'template_4v41dgg', {
        name: myName, phone, score: myScore, batch: myBatchId
      });

      sentMsg.style.display = 'block';
      btn.style.display     = 'none';
    } catch (err) {
      console.error(err);
      toast('Saved! Email notification may have failed.');
      btn.disabled    = false;
      btn.textContent = 'SEND MY NUMBER';
    }
  }
  window.submitPhone = submitPhone;

  // ── CONFETTI ──────────────────────────────────────────────────────
  function launchConfetti() {
    const c      = document.getElementById('particles');
    const colors = ['#ffd700', '#00ffcc', '#ff3c6e', '#ffffff', '#ff9500', '#aa88ff'];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('div');
      const sz = (4 + Math.random() * 7) + 'px';
      p.style.cssText = `
        position:absolute;
        width:${sz}; height:${sz};
        background:${colors[Math.floor(Math.random() * colors.length)]};
        left:${Math.random() * 100}%;
        bottom:-12px;
        border-radius:${Math.random() > .4 ? '50%' : '2px'};
        animation:floatUp ${3 + Math.random() * 5}s ${Math.random() * 2}s linear infinite;
        opacity:0;
      `;
      c.appendChild(p);
    }
  }

} // end initGame

// ─── GLOBAL UTILS ────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.display = 'none', 3000);
}

// ─── KEYBOARD: Enter to join ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const nameInput = document.getElementById('playerName');
  if (nameInput) {
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') joinGame();
    });
  }
});
