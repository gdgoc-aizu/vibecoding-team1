import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- Constants & Types ---
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;
const GRAVITY = 0.4;
const MAX_DRAG_DIST = 150;
const POWER_MULTIPLIER = 0.18;
const WALL_BOUNCE_MULTIPLIER = 1.5;
const PLATFORM_BOUNCE_MULTIPLIER = 0.65; // 反発係数
const BOUNCE_THRESHOLD = 2.0; // これ以下の速度なら着地（バウンド停止）
const MAX_VX = 25; // Cap horizontal speed to prevent physics explosions
const PLATFORM_WIDTH = 50;
const PLATFORM_HEIGHT = 10;
const PLAYER_SIZE = 20;
const PIXELS_PER_METER = 20; // 20 pixels equals 1 meter in game world

type Point = { x: number; y: number };

type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  isGrounded: boolean;
};

type Platform = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visited: boolean;
};

type GamePhase = 'title' | 'playing' | 'gameover';

type GameState = {
  phase: GamePhase;
  player: Player;
  platforms: Platform[];
  totalScrollY: number;
  maxLandedHeightMeters: number;
  currentHeightMeters: number;
  dragStart: Point | null;
  dragCurrent: Point | null;
  platformIdCounter: number;
};

// --- Helper Functions ---
const generatePlatform = (y: number, id: number): Platform => {
  // Keep platforms within playable horizontal bounds
  const x = Math.random() * (CANVAS_WIDTH - PLATFORM_WIDTH - 40) + 20;
  return { id, x, y, width: PLATFORM_WIDTH, height: PLATFORM_HEIGHT, visited: false };
};

const createInitialState = (phase: GamePhase = 'title'): GameState => {
  const platforms: Platform[] = [];
  let idCounter = 0;

  // Initial platform under the player (0m mark)
  platforms.push({
    id: idCounter++,
    x: CANVAS_WIDTH / 2 - PLATFORM_WIDTH / 2,
    y: CANVAS_HEIGHT - 100,
    width: PLATFORM_WIDTH,
    height: PLATFORM_HEIGHT,
    visited: true,
  });

  // Generate initial platforms upwards
  for (let y = CANVAS_HEIGHT - 250; y > -CANVAS_HEIGHT; y -= Math.random() * 80 + 70) {
    platforms.push(generatePlatform(y, idCounter++));
  }

  return {
    phase,
    player: {
      x: CANVAS_WIDTH / 2 - PLAYER_SIZE / 2,
      y: CANVAS_HEIGHT - 100 - PLAYER_SIZE,
      vx: 0,
      vy: 0,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      isGrounded: true,
    },
    platforms,
    totalScrollY: 0,
    maxLandedHeightMeters: 0,
    currentHeightMeters: 0,
    dragStart: null,
    dragCurrent: null,
    platformIdCounter: idCounter,
  };
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gamePhase, setGamePhase] = useState<GamePhase>('title');
  const [finalScore, setFinalScore] = useState(0);

  // Mutable game state to avoid React re-renders during the 60FPS loop
  const stateRef = useRef<GameState>(createInitialState('title'));

  const startGame = useCallback(() => {
    stateRef.current = createInitialState('playing');
    setFinalScore(0);
    setGamePhase('playing');
  }, []);

  // --- Game Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const update = () => {
      const state = stateRef.current;
      if (state.phase !== 'playing') return;

      const { player, platforms } = state;

      // Calculate current real-time height in meters
      const currentHeightPx = (CANVAS_HEIGHT - 100) - (player.y - state.totalScrollY);
      state.currentHeightMeters = Math.floor(currentHeightPx / PIXELS_PER_METER);

      // Apply Physics if not grounded
      if (!player.isGrounded) {
        player.vy += GRAVITY;
        player.x += player.vx;
        player.y += player.vy;

        // Wall Collision (Gekimuzu mechanic: bounce with acceleration)
        if (player.x <= 0) {
          player.x = 0;
          player.vx = Math.min(Math.abs(player.vx) * WALL_BOUNCE_MULTIPLIER, MAX_VX);
        } else if (player.x + player.width >= CANVAS_WIDTH) {
          player.x = CANVAS_WIDTH - player.width;
          player.vx = Math.max(-Math.abs(player.vx) * WALL_BOUNCE_MULTIPLIER, -MAX_VX);
        }

        // Platform Collision (only when falling)
        if (player.vy > 0) {
          for (const plat of platforms) {
            // Check intersection
            if (
              player.x < plat.x + plat.width &&
              player.x + player.width > plat.x &&
              player.y + player.height >= plat.y &&
              player.y + player.height <= plat.y + player.vy + 2 // Tolerance for high speed
            ) {
              // Calculate height of the landed platform
              const landedHeightPx = (CANVAS_HEIGHT - 100) - (plat.y - state.totalScrollY);
              const landedHeightMeters = Math.floor(landedHeightPx / PIXELS_PER_METER);

              // Update max landed height for the final score
              if (landedHeightMeters > state.maxLandedHeightMeters) {
                state.maxLandedHeightMeters = landedHeightMeters;
              }

              if (!plat.visited) {
                plat.visited = true;
              }

              // Bounce logic with restitution coefficient
              if (player.vy > BOUNCE_THRESHOLD) {
                player.vy = -player.vy * PLATFORM_BOUNCE_MULTIPLIER;
                player.vx = player.vx * 0.8; // Apply some friction so they don't slide off instantly
                player.y = plat.y - player.height;
              } else {
                // Settle on the platform
                player.isGrounded = true;
                player.vy = 0;
                player.vx = 0;
                player.y = plat.y - player.height;
              }
              break;
            }
          }
        }
      }

      // Camera Scrolling
      const topScrollThreshold = CANVAS_HEIGHT / 2;
      const bottomScrollThreshold = CANVAS_HEIGHT - 100;

      if (player.y < topScrollThreshold) {
        // Scroll up when player goes high
        const diff = topScrollThreshold - player.y;
        player.y += diff;
        platforms.forEach(p => p.y += diff);
        state.totalScrollY += diff;
      } else if (player.y > bottomScrollThreshold) {
        // Scroll down when player falls, keeping them on screen until 0m
        const diff = player.y - bottomScrollThreshold;
        player.y -= diff;
        platforms.forEach(p => p.y -= diff);
        state.totalScrollY -= diff;
      }

      // Generate new platforms at the top
      const highestPlatform = platforms.reduce((min, p) => p.y < min.y ? p : min, platforms[0]);
      if (highestPlatform && highestPlatform.y > 100) {
        state.platforms.push(generatePlatform(highestPlatform.y - (Math.random() * 80 + 70), state.platformIdCounter++));
      }

      // Game Over Check: If height drops below 0m
      if (state.currentHeightMeters < 0) {
        state.phase = 'gameover';
        setFinalScore(state.maxLandedHeightMeters);
        setGamePhase('gameover');
      }
    };

    const draw = () => {
      const state = stateRef.current;

      // Clear Canvas to let the CSS background image show through
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Platforms (Branches)
      ctx.fillStyle = '#4A3728'; // Dark brown
      state.platforms.forEach(plat => {
        // Only draw platforms that are somewhat visible to save rendering time
        if (plat.y > -50 && plat.y < CANVAS_HEIGHT + 50) {
          // Branch
          ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
          // Little pink flowers on the branch
          ctx.fillStyle = '#FFB7C5';
          ctx.beginPath();
          ctx.arc(plat.x + 10, plat.y - 2, 4, 0, Math.PI * 2);
          ctx.arc(plat.x + plat.width - 10, plat.y - 2, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4A3728'; // Reset for next branch
        }
      });

      // Draw Player (Spring)
      const { player } = state;
      ctx.save();
      ctx.strokeStyle = '#C0C0C0'; // Silver spring
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Compress spring if dragging
      let springHeight = player.height;
      let yOffset = 0;
      if (state.dragStart && state.dragCurrent && player.isGrounded) {
        const dy = state.dragCurrent.y - state.dragStart.y;
        if (dy > 0) {
          // Compress downwards
          const compression = Math.min(dy * 0.2, player.height * 0.6);
          springHeight = player.height - compression;
          yOffset = compression;
        }
      }

      ctx.beginPath();
      const px = player.x;
      const py = player.y + yOffset;
      const pw = player.width;
      const ph = springHeight;

      // Zig-zag spring shape
      ctx.moveTo(px, py + ph);
      ctx.lineTo(px + pw, py + ph * 0.8);
      ctx.lineTo(px, py + ph * 0.6);
      ctx.lineTo(px + pw, py + ph * 0.4);
      ctx.lineTo(px, py + ph * 0.2);
      ctx.lineTo(px + pw / 2, py);
      ctx.stroke();

      // Spring head
      ctx.fillStyle = '#FF4500'; // Orange red head
      ctx.beginPath();
      ctx.arc(px + pw / 2, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Draw Prediction Line
      if (state.dragStart && state.dragCurrent && player.isGrounded) {
        const dx = state.dragStart.x - state.dragCurrent.x;
        const dy = state.dragStart.y - state.dragCurrent.y;

        let pvx = dx * POWER_MULTIPLIER;
        let pvy = dy * POWER_MULTIPLIER;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();

        let simX = player.x + player.width / 2;
        let simY = player.y;
        ctx.moveTo(simX, simY);

        // Simulate a few frames
        for (let i = 0; i < 25; i++) {
          pvy += GRAVITY;
          simX += pvx;
          simY += pvy;

          // Simple wall bounce simulation for prediction
          if (simX <= 0 || simX >= CANVAS_WIDTH) {
             pvx = -pvx * WALL_BOUNCE_MULTIPLIER;
             simX = Math.max(0, Math.min(simX, CANVAS_WIDTH));
          }

          ctx.lineTo(simX, simY);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Draw Real-time Score (Height in meters)
      if (state.phase === 'playing') {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'left';
        // Add stroke for better visibility against the background image
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 4;
        ctx.strokeText(`高度: ${Math.max(0, state.currentHeightMeters)} m`, 15, 35);
        ctx.fillText(`高度: ${Math.max(0, state.currentHeightMeters)} m`, 15, 35);
      }
    };

    const loop = () => {
      update();
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // --- Input Handling ---
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = stateRef.current;
    if (state.phase !== 'playing' || !state.player.isGrounded) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    state.dragStart = { x, y };
    state.dragCurrent = { x, y };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const state = stateRef.current;
    if (!state.dragStart) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Limit drag distance visually and mechanically
    const dx = x - state.dragStart.x;
    const dy = y - state.dragStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > MAX_DRAG_DIST) {
      const angle = Math.atan2(dy, dx);
      state.dragCurrent = {
        x: state.dragStart.x + Math.cos(angle) * MAX_DRAG_DIST,
        y: state.dragStart.y + Math.sin(angle) * MAX_DRAG_DIST,
      };
    } else {
      state.dragCurrent = { x, y };
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    const state = stateRef.current;
    if (!state.dragStart || !state.dragCurrent || !state.player.isGrounded) {
      state.dragStart = null;
      state.dragCurrent = null;
      return;
    }

    const dx = state.dragStart.x - state.dragCurrent.x;
    const dy = state.dragStart.y - state.dragCurrent.y;

    // Only jump if dragged a minimum distance
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      state.player.vx = dx * POWER_MULTIPLIER;
      state.player.vy = dy * POWER_MULTIPLIER;
      state.player.isGrounded = false;
    }

    state.dragStart = null;
    state.dragCurrent = null;
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 select-none">
      <div className="relative shadow-2xl shadow-pink-900/20 rounded-lg overflow-hidden border-4 border-gray-800">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="cursor-crosshair block bg-sky-300"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            backgroundImage: 'url(./output.png)', // Assumes the user places the image as background.png
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />

        {gamePhase === 'title' && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-4 text-center backdrop-blur-sm">
            <h1 className="text-6xl font-black text-pink-400 mb-4 drop-shadow-[0_0_15px_rgba(255,183,197,0.9)] tracking-wider">
              Spring Spring
            </h1>
            <p className="text-white font-bold text-lg mb-12 drop-shadow-md">
              ドラッグ＆リリースでジャンプ！
            </p>
            <button
              onClick={startGame}
              className="px-10 py-5 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-full text-2xl transition-transform transform hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(236,72,153,0.8)]"
            >
              ゲームスタート
            </button>
          </div>
        )}

        {gamePhase === 'gameover' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-4 text-center">
            <h1 className="text-5xl font-black text-red-500 mb-4 drop-shadow-[0_0_10px_rgba(255,0,0,0.8)] tracking-wider">
              GAME OVER
            </h1>
            <p className="text-3xl font-bold text-white mb-8">
              記録: <span className="text-yellow-400">{finalScore}</span> m
            </p>
            <button
              onClick={startGame}
              className="px-8 py-4 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-full text-xl transition-transform transform hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(236,72,153,0.5)]"
            >
              もう一度プレイ
            </button>
          </div>
        )}
      </div>
      <p className="text-gray-400 mt-4 text-sm max-w-[400px] text-center">
        壁にぶつかると加速して反射する激ムズ仕様。<br/>
        0m未満に落下するとゲームオーバー！
      </p>
    </div>
  );
}
