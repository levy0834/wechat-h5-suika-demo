const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const currentFruitEl = document.getElementById('currentFruit');
const nextFruitEl = document.getElementById('nextFruit');
const topGuide = document.getElementById('topGuide');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const DROP_Y = 86;
const WALL = 20;
const TOP_LINE = 128;

const FIXED_STEP_MS = 1000 / 60;
const MAX_SIM_STEPS = 5;
const GRAVITY = 0.32;
const AIR_DAMPING = 0.995;
const FLOOR_FRICTION = 0.93;
const WALL_BOUNCE = 0.08;
const FLOOR_BOUNCE = 0.02;

const SOLVER_ITERATIONS = 7;
const POSITION_SLOP = 0.05;
const POSITION_CORRECTION = 0.85;
const COLLISION_RESTITUTION = 0.02;
const COLLISION_FRICTION = 0.12;

const MERGE_BUFFER = 5;
const MERGE_MAX_REL_SPEED = 1.6;
const MERGE_COOLDOWN_FRAMES = 5;

const SLEEP_SPEED_SQ = 0.028;
const SLEEP_FRAMES_REQUIRED = 28;
const WAKE_OVERLAP = 1.1;
const WAKE_SPEED = 0.36;

const fruitDefs = [
  { name: '樱桃', radius: 18, color: '#ef4444', score: 2, asset: 'assets/fruits/cherry.svg' },
  { name: '橘子', radius: 24, color: '#f97316', score: 4, asset: 'assets/fruits/orange.svg' },
  { name: '柠檬', radius: 30, color: '#facc15', score: 8, asset: 'assets/fruits/lemon.svg' },
  { name: '猕猴桃', radius: 38, color: '#84cc16', score: 16, asset: 'assets/fruits/kiwi.svg' },
  { name: '桃子', radius: 46, color: '#fb7185', score: 32, asset: 'assets/fruits/peach.svg' },
  { name: '椰子', radius: 56, color: '#a16207', score: 64, asset: 'assets/fruits/coconut.svg' },
  { name: '大西瓜', radius: 68, color: '#22c55e', score: 128, asset: 'assets/fruits/watermelon.svg' },
];

const fruitImages = fruitDefs.map(() => null);

let fruits = [];
let score = 0;
let running = false;
let currentType = 0;
let nextType = 0;
let dropX = WIDTH / 2;
let dropCooldown = 0;
let gameOver = false;
let overFrames = 0;
let fruitId = 0;
let accumulator = 0;
let lastTime = 0;
let dragging = false;

function randType() {
  return Math.floor(Math.random() * 4);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function massForType(type) {
  const r = fruitDefs[type].radius;
  return r * r;
}

function invMassForFruit(fruit) {
  return 1 / massForType(fruit.type);
}

function wakeFruit(fruit) {
  fruit.asleep = false;
  fruit.sleepFrames = 0;
}

function wakeNearby(x, y, range) {
  const rangeSq = range * range;
  for (const fruit of fruits) {
    const dx = fruit.x - x;
    const dy = fruit.y - y;
    if (dx * dx + dy * dy <= rangeSq) {
      wakeFruit(fruit);
    }
  }
}

function makeFruit(type, x, y, vx = 0, vy = 0, mergeCooldown = 0) {
  return {
    id: `${Date.now()}-${fruitId += 1}`,
    type,
    x,
    y,
    vx,
    vy,
    merged: false,
    asleep: false,
    sleepFrames: 0,
    grounded: false,
    touching: 0,
    mergeCooldown,
  };
}

function preloadFruitArt() {
  for (let i = 0; i < fruitDefs.length; i += 1) {
    const img = new Image();
    img.decoding = 'async';
    img.src = fruitDefs[i].asset;
    img.onload = () => {
      fruitImages[i] = img;
      if (i === currentType || i === nextType) {
        syncPreview();
      }
    };
  }
}

function setPreview(element, type) {
  const def = fruitDefs[type];
  const size = Math.min(56, def.radius * 1.28);
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.backgroundColor = def.color;
  element.style.backgroundImage = `url('${def.asset}')`;
  element.style.backgroundSize = 'cover';
  element.style.backgroundRepeat = 'no-repeat';
  element.style.backgroundPosition = 'center';
}

function syncPreview() {
  setPreview(currentFruitEl, currentType);
  setPreview(nextFruitEl, nextType);
}

function updateGuidePosition() {
  const rect = canvas.getBoundingClientRect();
  topGuide.style.left = `${(dropX / WIDTH) * rect.width}px`;
}

function resetGame() {
  fruits = [];
  score = 0;
  running = true;
  gameOver = false;
  overFrames = 0;
  accumulator = 0;
  lastTime = 0;
  scoreEl.textContent = score;
  currentType = randType();
  nextType = randType();
  dropX = WIDTH / 2;
  dropCooldown = 0;
  updateGuidePosition();
  syncPreview();
  overlay.classList.add('hidden');
}

function spawnFruit(type, x) {
  const fruit = makeFruit(type, x, DROP_Y, 0, 0, 0);
  fruits.push(fruit);
  wakeNearby(x, DROP_Y + 56, 110);
}

function spawnMergedFruit(type, x, y, vx, vy) {
  const fruit = makeFruit(type, x, y, vx * 0.32, Math.min(vy * 0.2, 0) - 0.32, MERGE_COOLDOWN_FRAMES);
  fruits.push(fruit);
  wakeNearby(x, y, 120);
}

function dropFruit() {
  if (!running || dropCooldown > 0 || gameOver) return;
  const def = fruitDefs[currentType];
  const x = clamp(dropX, WALL + def.radius, WIDTH - WALL - def.radius);
  spawnFruit(currentType, x);
  currentType = nextType;
  nextType = randType();
  syncPreview();
  dropCooldown = 18;
}

function drawBackground() {
  const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  bg.addColorStop(0, '#fffbeb');
  bg.addColorStop(0.6, '#fde68a');
  bg.addColorStop(1, '#fdba74');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = 'rgba(220,38,38,0.18)';
  ctx.fillRect(WALL, TOP_LINE, WIDTH - WALL * 2, 3);

  ctx.strokeStyle = 'rgba(124,45,18,0.16)';
  ctx.lineWidth = 8;
  ctx.strokeRect(WALL, 24, WIDTH - WALL * 2, HEIGHT - 32);
}

function drawFruit(fruit) {
  const def = fruitDefs[fruit.type];
  const img = fruitImages[fruit.type];

  ctx.save();
  ctx.translate(fruit.x, fruit.y);
  ctx.beginPath();
  ctx.arc(0, 0, def.radius, 0, Math.PI * 2);
  ctx.clip();

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, -def.radius, -def.radius, def.radius * 2, def.radius * 2);
  } else {
    ctx.fillStyle = def.color;
    ctx.fillRect(-def.radius, -def.radius, def.radius * 2, def.radius * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    ctx.beginPath();
    ctx.arc(-def.radius * 0.3, -def.radius * 0.3, def.radius * 0.33, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  ctx.strokeStyle = 'rgba(64,40,18,0.2)';
  ctx.lineWidth = Math.max(1.1, def.radius * 0.07);
  ctx.beginPath();
  ctx.arc(fruit.x, fruit.y, def.radius - 0.6, 0, Math.PI * 2);
  ctx.stroke();
}

function applyBounds(fruit) {
  const def = fruitDefs[fruit.type];
  const minX = WALL + def.radius;
  const maxX = WIDTH - WALL - def.radius;

  if (fruit.x < minX) {
    const penetration = minX - fruit.x;
    fruit.x = minX;
    if (fruit.vx < 0) {
      fruit.vx = -fruit.vx * WALL_BOUNCE;
    }
    if (penetration > WAKE_OVERLAP) wakeFruit(fruit);
  }

  if (fruit.x > maxX) {
    const penetration = fruit.x - maxX;
    fruit.x = maxX;
    if (fruit.vx > 0) {
      fruit.vx = -fruit.vx * WALL_BOUNCE;
    }
    if (penetration > WAKE_OVERLAP) wakeFruit(fruit);
  }

  const floorY = HEIGHT - 18 - def.radius;
  if (fruit.y > floorY) {
    const penetration = fruit.y - floorY;
    fruit.y = floorY;
    fruit.grounded = true;
    if (fruit.vy > 0) {
      fruit.vy = -fruit.vy * FLOOR_BOUNCE;
    }
    fruit.vx *= FLOOR_FRICTION;
    if (penetration > WAKE_OVERLAP) wakeFruit(fruit);
  }
}

function integrate() {
  for (const fruit of fruits) {
    fruit.grounded = false;
    fruit.touching = 0;

    if (fruit.mergeCooldown > 0) {
      fruit.mergeCooldown -= 1;
    }

    if (fruit.asleep) {
      fruit.vx = 0;
      fruit.vy = 0;
      continue;
    }

    fruit.vy += GRAVITY;
    fruit.x += fruit.vx;
    fruit.y += fruit.vy;
    fruit.vx *= AIR_DAMPING;
    fruit.vy *= AIR_DAMPING;
  }

  for (const fruit of fruits) {
    applyBounds(fruit);
  }
}

function solveCollisions() {
  for (let iter = 0; iter < SOLVER_ITERATIONS; iter += 1) {
    for (let i = 0; i < fruits.length; i += 1) {
      const a = fruits[i];
      if (a.merged) continue;

      for (let j = i + 1; j < fruits.length; j += 1) {
        const b = fruits[j];
        if (b.merged) continue;

        const ra = fruitDefs[a.type].radius;
        const rb = fruitDefs[b.type].radius;
        const minDist = ra + rb;

        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) continue;

        let dist = Math.sqrt(distSq);
        if (dist < 0.0001) {
          dist = 0.0001;
          dx = minDist;
          dy = 0;
          distSq = dx * dx;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        const baseInvMassA = invMassForFruit(a);
        const baseInvMassB = invMassForFruit(b);
        let invMassA = a.asleep ? 0 : baseInvMassA;
        let invMassB = b.asleep ? 0 : baseInvMassB;

        if (invMassA + invMassB === 0) {
          invMassA = baseInvMassA;
          invMassB = baseInvMassB;
        }

        const invMassSum = invMassA + invMassB;
        const correction = Math.max(overlap - POSITION_SLOP, 0) * POSITION_CORRECTION;

        if (correction > 0) {
          const moveA = correction * (invMassA / invMassSum);
          const moveB = correction * (invMassB / invMassSum);
          a.x -= nx * moveA;
          a.y -= ny * moveA;
          b.x += nx * moveB;
          b.y += ny * moveB;
        }

        a.touching += 1;
        b.touching += 1;
        if (ny > 0.45) a.grounded = true;
        if (ny < -0.45) b.grounded = true;

        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;

        if (velAlongNormal < 0) {
          const impulse = (-(1 + COLLISION_RESTITUTION) * velAlongNormal) / invMassSum;
          const impulseX = impulse * nx;
          const impulseY = impulse * ny;

          if (!a.asleep) {
            a.vx -= impulseX * invMassA;
            a.vy -= impulseY * invMassA;
          }

          if (!b.asleep) {
            b.vx += impulseX * invMassB;
            b.vy += impulseY * invMassB;
          }

          const tangentX = rvx - velAlongNormal * nx;
          const tangentY = rvy - velAlongNormal * ny;
          const tangentLen = Math.hypot(tangentX, tangentY);

          if (tangentLen > 0.0001) {
            const tx = tangentX / tangentLen;
            const ty = tangentY / tangentLen;
            let frictionImpulse = -(rvx * tx + rvy * ty) / invMassSum;
            const maxFrictionImpulse = impulse * COLLISION_FRICTION;
            frictionImpulse = clamp(frictionImpulse, -maxFrictionImpulse, maxFrictionImpulse);

            if (!a.asleep) {
              a.vx -= tx * frictionImpulse * invMassA;
              a.vy -= ty * frictionImpulse * invMassA;
            }
            if (!b.asleep) {
              b.vx += tx * frictionImpulse * invMassB;
              b.vy += ty * frictionImpulse * invMassB;
            }
          }
        }

        if (overlap > WAKE_OVERLAP || Math.abs(velAlongNormal) > WAKE_SPEED) {
          wakeFruit(a);
          wakeFruit(b);
        }
      }
    }

    for (const fruit of fruits) {
      applyBounds(fruit);
    }
  }
}

function pickMergePairs() {
  const pairs = [];
  for (let i = 0; i < fruits.length; i += 1) {
    const a = fruits[i];
    if (a.merged) continue;

    for (let j = i + 1; j < fruits.length; j += 1) {
      const b = fruits[j];
      if (b.merged) continue;

      if (a.type !== b.type || a.type >= fruitDefs.length - 1) continue;
      if (a.mergeCooldown > 0 || b.mergeCooldown > 0) continue;

      const ra = fruitDefs[a.type].radius;
      const rb = fruitDefs[b.type].radius;
      const minDist = ra + rb;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > minDist + MERGE_BUFFER) continue;

      const relVx = b.vx - a.vx;
      const relVy = b.vy - a.vy;
      const relSpeed = Math.hypot(relVx, relVy);
      if (relSpeed > MERGE_MAX_REL_SPEED) continue;

      const closeness = minDist + MERGE_BUFFER - dist;
      const scoreWeight = closeness - relSpeed * 0.6;
      pairs.push({ a, b, scoreWeight });
    }
  }

  pairs.sort((x, y) => y.scoreWeight - x.scoreWeight);
  const locked = new Set();
  const chosen = [];

  for (const pair of pairs) {
    if (locked.has(pair.a.id) || locked.has(pair.b.id)) continue;
    locked.add(pair.a.id);
    locked.add(pair.b.id);
    chosen.push(pair);
  }

  return chosen;
}

function applyMerges(pairs) {
  if (pairs.length === 0) return;

  for (const pair of pairs) {
    const { a, b } = pair;
    if (a.merged || b.merged) continue;

    a.merged = true;
    b.merged = true;

    const massA = massForType(a.type);
    const massB = massForType(b.type);
    const sumMass = massA + massB;

    const x = (a.x * massA + b.x * massB) / sumMass;
    const y = (a.y * massA + b.y * massB) / sumMass;
    const vx = (a.vx * massA + b.vx * massB) / sumMass;
    const vy = (a.vy * massA + b.vy * massB) / sumMass;

    const newType = a.type + 1;
    score += fruitDefs[newType].score;
    scoreEl.textContent = score;
    spawnMergedFruit(newType, x, y, vx, vy);
  }

  fruits = fruits.filter((fruit) => !fruit.merged);
}

function updateSleepState() {
  for (const fruit of fruits) {
    if (fruit.asleep) continue;

    const speedSq = fruit.vx * fruit.vx + fruit.vy * fruit.vy;
    const stableContact = fruit.grounded || fruit.touching > 0;

    if (speedSq < SLEEP_SPEED_SQ && stableContact) {
      fruit.sleepFrames += 1;
    } else {
      fruit.sleepFrames = Math.max(0, fruit.sleepFrames - 2);
    }

    if (fruit.sleepFrames >= SLEEP_FRAMES_REQUIRED) {
      fruit.asleep = true;
      fruit.vx = 0;
      fruit.vy = 0;
    }
  }
}

function updateDangerLine() {
  const danger = fruits.some((fruit) => fruit.y - fruitDefs[fruit.type].radius < TOP_LINE);
  overFrames = danger ? overFrames + 1 : Math.max(0, overFrames - 3);
  if (overFrames > 80) {
    endGame();
  }
}

function updatePhysicsStep() {
  if (!running || gameOver) return;

  dropCooldown = Math.max(0, dropCooldown - 1);

  integrate();
  solveCollisions();

  const mergePairs = pickMergePairs();
  applyMerges(mergePairs);

  for (const fruit of fruits) {
    applyBounds(fruit);
  }

  updateSleepState();
  updateDangerLine();
}

function endGame() {
  gameOver = true;
  running = false;
  overlay.classList.remove('hidden');
  overlayTitle.textContent = '游戏结束';
  overlayText.textContent = `这次拿了 ${score} 分。别慌，再来一局，西瓜就在下一把。`;
  startBtn.textContent = '再来一局';
}

function draw() {
  drawBackground();
  for (const fruit of fruits) {
    drawFruit(fruit);
  }

  ctx.fillStyle = 'rgba(124,45,18,0.7)';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('危险线', WIDTH / 2, TOP_LINE - 12);
}

function loop(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }

  const frameDelta = Math.min(50, timestamp - lastTime);
  lastTime = timestamp;
  accumulator += frameDelta;

  let stepCount = 0;
  while (accumulator >= FIXED_STEP_MS && stepCount < MAX_SIM_STEPS) {
    updatePhysicsStep();
    accumulator -= FIXED_STEP_MS;
    stepCount += 1;
  }

  if (stepCount === MAX_SIM_STEPS) {
    accumulator = 0;
  }

  draw();
  requestAnimationFrame(loop);
}

function setDropFromClientX(clientX) {
  const rect = canvas.getBoundingClientRect();
  const ratio = WIDTH / rect.width;
  const radius = fruitDefs[currentType].radius;
  dropX = clamp((clientX - rect.left) * ratio, WALL + radius, WIDTH - WALL - radius);
  updateGuidePosition();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!running || gameOver) return;
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
  setDropFromClientX(event.clientX);
});

canvas.addEventListener('pointermove', (event) => {
  if (!running || gameOver) return;
  if (!dragging && event.pointerType === 'mouse' && event.buttons === 0) return;
  setDropFromClientX(event.clientX);
});

canvas.addEventListener('pointerup', (event) => {
  if (!running || gameOver) return;
  if (!dragging) return;
  setDropFromClientX(event.clientX);
  dropFruit();
  dragging = false;
});

canvas.addEventListener('pointercancel', () => {
  dragging = false;
});

startBtn.addEventListener('click', resetGame);
restartBtn.addEventListener('click', resetGame);
window.addEventListener('resize', updateGuidePosition);

preloadFruitArt();
resetGame();
requestAnimationFrame(loop);
