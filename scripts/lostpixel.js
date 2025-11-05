const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE = 32;
const rows = 10;
const cols = 15;

// 0 = empty, 1 = wall, 2 = collectible, 3 = portal
const map = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 3, 1],
    [1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 2, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

let player = { x: 1, y: 1, color: '#00ffff', gems: 0 };
const dialog = document.getElementById('dialog-box');

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const tile = map[y][x];
            if (tile === 1) {
                ctx.fillStyle = '#222';
                ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
            } else if (tile === 2) {
                ctx.fillStyle = '#ff00ff';
                ctx.fillRect(x * TILE + 10, y * TILE + 10, 12, 12);
            } else if (tile === 3) {
                ctx.fillStyle = '#00ff00';
                ctx.fillRect(x * TILE + 8, y * TILE + 8, 16, 16);
            }
        }
    }
    // Draw player
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x * TILE + 8, player.y * TILE + 8, 16, 16);
}

function move(dx, dy) {
    const newX = player.x + dx;
    const newY = player.y + dy;

    if (map[newY][newX] === 1) return; // wall block

    player.x = newX;
    player.y = newY;

    // Collect gem
    if (map[newY][newX] === 2) {
        map[newY][newX] = 0;
        player.gems++;
        showDialog(`💎 You found a Color Fragment! (${player.gems}/4)`);
    }

    // Portal win condition
    if (map[newY][newX] === 3 && player.gems >= 4) {
        showDialog("🌈 You restored the color and escaped the void! The machine hums back to life...");
        setTimeout(() => alert("✨ YOU WON! The Lost Pixel has been found."), 2000);
    } else if (map[newY][newX] === 3) {
        showDialog("🚪 The portal is sealed... You need more fragments.");
    }

    draw();
}

function showDialog(text) {
    dialog.textContent = text;
    dialog.classList.remove('hidden');
    clearTimeout(dialog.timeout);
    dialog.timeout = setTimeout(() => dialog.classList.add('hidden'), 3000);
}

window.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'w') move(0, -1);
    if (e.key === 'ArrowDown' || e.key === 's') move(0, 1);
    if (e.key === 'ArrowLeft' || e.key === 'a') move(-1, 0);
    if (e.key === 'ArrowRight' || e.key === 'd') move(1, 0);
});

draw();
showDialog("💬 You awaken in the void... Find the color fragments to escape!");
