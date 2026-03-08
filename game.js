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

const fruitDefs = [
  { name: '樱桃', radius: 18, color: '#ef4444', score: 2 },
  { name: '橘子', radius: 24, color: '#f97316', score: 4 },
  { name: '柠檬', radius: 30, color: '#facc15', score: 8 },
  { name: '猕猴桃', radius: 38, color: '#84cc16', score: 16 },
  { name: '桃子', radius: 46, color: '#fb7185', score: 32 },
  { name: '椰子', radius: 56, color: '#a16207', score: 64 },
  { name: '大西瓜', radius: 68, color: '#22c55e', score: 128 },
];

let fruits = [];
let score = 0;
let running = false;
let currentType = 0;
let nextType = 0;
let dropX = WIDTH / 2;
let dropCooldown = 0;
let gameOver = false;
let overFrames = 0;

function randType() {
  return Math.floor(Math.random() * 4);
}

function setPreview(element, type) {
  const def = fruitDefs[type];
  const size = Math.min(52, def.radius * 1.25);
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.background = def.color;
}

function syncPreview() {
  setPreview(currentFruitEl, currentType);
  setPreview(nextFruitEl, nextType);
}

function resetGame() {
  fruits = [];
  score = 0;
  running = true;
  gameOver = false;
  overFrames = 0;
  scoreEl.textContent = score;
  currentType = randType();
  nextType = randType();
  dropX = WIDTH / 2;
  dropCooldown = 0;
  topGuide.style.left = `${dropX}px`;
  syncPreview();
  overlay.classList.add('hidden');
}

function spawnFruit(type, x) {
  const def = fruitDefs[type];
  fruits.push({
    id: `${Date.now()}-${Math.random()}`,
    type,
    x,
    y: DROP_Y,
    vx: 0,
    vy: 0,
    merged: false,
  });
}

function dropFruit() {
  if (!running || dropCooldown > 0 || gameOver) return;
  const def = fruitDefs[currentType];
  const x = Math.max(WALL + def.radius, Math.min(WIDTH - WALL - def.radius, dropX));
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
  ctx.save();
  ctx.translate(fruit.x, fruit.y);
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.arc(0, 0, def.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.arc(-def.radius * 0.28, -def.radius * 0.3, def.radius * 0.33, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function updatePhysics() {
  if (!running || gameOver) return;

  dropCooldown = Math.max(0, dropCooldown - 1);

  for (const fruit of fruits) {
    const def = fruitDefs[fruit.type];
    fruit.vy += 0.34;
    fruit.y += fruit.vy;
    fruit.x += fruit.vx;
    fruit.vx *= 0.992;

    if (fruit.x - def.radius < WALL) {
      fruit.x = WALL + def.radius;
      fruit.vx *= -0.45;
    }
    if (fruit.x + def.radius > WIDTH - WALL) {
      fruit.x = WIDTH - WALL - def.radius;
      fruit.vx *= -0.45;
    }

    const floor = HEIGHT - 18 - def.radius;
    if (fruit.y > floor) {
      fruit.y = floor;
      fruit.vy *= -0.18;
      fruit.vx *= 0.98;
      if (Math.abs(fruit.vy) < 0.45) fruit.vy = 0;
    }
  }

  for (let i = 0; i < fruits.length; i += 1) {
    for (let j = i + 1; j < fruits.length; j += 1) {
      const a = fruits[i];
      const b = fruits[j];
      if (a.merged || b.merged) continue;

      const ra = fruitDefs[a.type].radius;
      const rb = fruitDefs[b.type].radius;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const minDist = ra + rb;
      const mergeDist = minDist + 8;

      if (dist < mergeDist) {
        const overlap = Math.max(0, minDist - dist);
        const nx = dx / dist;
        const ny = dy / dist;

        if (overlap > 0) {
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          const push = 0.08;
          a.vx -= nx * push;
          a.vy -= ny * push;
          b.vx += nx * push;
          b.vy += ny * push;
        }

        if (a.type === b.type && a.type < fruitDefs.length - 1) {
          a.merged = true;
          b.merged = true;
          const newType = a.type + 1;
          score += fruitDefs[newType].score;
          scoreEl.textContent = score;
          spawnMergedFruit(newType, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
      }
    }
  }

  fruits = fruits.filter((fruit) => !fruit.merged);

  const danger = fruits.some((fruit) => fruit.y - fruitDefs[fruit.type].radius < TOP_LINE);
  overFrames = danger ? overFrames + 1 : 0;
  if (overFrames > 70) {
    endGame();
  }
}

function spawnMergedFruit(type, x, y) {
  fruits.push({
    id: `merged-${Date.now()}-${Math.random()}`,
    type,
    x,
    y,
    vx: (Math.random() - 0.5) * 1.6,
    vy: -1.8,
    merged: false,
  });
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

function loop() {
  updatePhysics();
  draw();
  requestAnimationFrame(loop);
}

function setDropFromClientX(clientX) {
  const rect = canvas.getBoundingClientRect();
  const ratio = WIDTH / rect.width;
  dropX = (clientX - rect.left) * ratio;
  dropX = Math.max(WALL + 22, Math.min(WIDTH - WALL - 22, dropX));
  topGuide.style.left = `${(dropX / WIDTH) * rect.width}px`;
}

canvas.addEventListener('pointerdown', (event) => {
  if (!running) return;
  setDropFromClientX(event.clientX);
});

canvas.addEventListener('pointermove', (event) => {
  if (!running) return;
  setDropFromClientX(event.clientX);
});

canvas.addEventListener('pointerup', (event) => {
  if (!running) return;
  setDropFromClientX(event.clientX);
  dropFruit();
});

startBtn.addEventListener('click', resetGame);
restartBtn.addEventListener('click', resetGame);
window.addEventListener('resize', () => {
  const rect = canvas.getBoundingClientRect();
  topGuide.style.left = `${(dropX / WIDTH) * rect.width}px`;
});

resetGame();
loop();
