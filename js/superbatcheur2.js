import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const FANCY_NOTE_HEIGHT  = 330;  // fixed px height for the padded_index display + slider
const KNOB_HEIGHT        = 520;  // fixed px height for the knob widget
const KNOB_DEFAULT_MAX   = 200;  // default dial range max for newly created nodes
                                  // (the underlying knobValue widget's own max stays
                                  // much higher — see INPUT_TYPES in the .py file —
                                  // so users can still raise this past 200 via the
                                  // settings modal without hitting a server-side wall)

const THEMES = [
    "cyberpunk", "steampunk", "minimal", "glass", "retro",
    "futuristic", "gaming", "dark", "nature", "cartoon",
    "vaporwave", "brutalist", "material", "neumorphism", "skeuomorphic",
];

const SHAPES = ["knob", "vertical_slider", "horizontal_slider"];

// Generates a stable per-node identity used to key the Python-side state
// file, persisted in node.properties.uuid (see node_uuid in superbatcheur2.py).
const generateNodeUUID = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return `sb2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const THEME_DEFAULTS = {
    cyberpunk:    { color: "#ff00ff", title: "Cyberpunk" },
    steampunk:    { color: "#b57c48", title: "Steampunk" },
    minimal:      { color: "#888888", title: "Minimal" },
    glass:        { color: "#ffffff", title: "Glass" },
    retro:        { color: "#c9a87c", title: "Retro" },
    futuristic:   { color: "#00aaff", title: "Futuristic" },
    gaming:       { color: "#ff0066", title: "Gaming" },
    dark:         { color: "#0ff",    title: "Dark" },
    nature:       { color: "#6b8e4c", title: "Nature" },
    cartoon:      { color: "#ffcc00", title: "Cartoon" },
    vaporwave:    { color: "#ff7eb3", title: "Vaporwave" },
    brutalist:    { color: "#000000", title: "Brutalist" },
    material:     { color: "#6200ee", title: "Material" },
    neumorphism:  { color: "#b0b0b0", title: "Neumorphism" },
    skeuomorphic: { color: "#f00",    title: "Skeuomorphic" },
};

// ─── CSS ─────────────────────────────────────────────────────────────────────

const style = document.createElement("style");
style.innerHTML = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700&display=swap');

/* ── Fancy Note strip ─────────────────────────────────────────────────────── */
@keyframes sb2-fancy-glow-pulse {
    0%, 100% { text-shadow: 0 0 18px var(--sb2-fancy-color, #7300ff), 0 0 6px var(--sb2-fancy-color, #7300ff); }
    50%       { text-shadow: 0 0 32px var(--sb2-fancy-color, #7300ff), 0 0 12px var(--sb2-fancy-color, #7300ff); }
}
.sb2-fancy-strip {
    width: 100%; height: 100%;
    background: #000;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    position: relative; overflow: hidden; box-sizing: border-box;
    gap: 6px;
}
.sb2-fancy-strip::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(ellipse at center, rgba(115,0,255,0.08) 0%, transparent 70%);
    pointer-events: none;
}
.sb2-fancy-text {
    font-family: 'Orbitron', monospace; font-weight: 700;
    color: var(--sb2-fancy-color, #7300ff);
    font-size: 12px; letter-spacing: 0.12em; text-align: center;
    animation: sb2-fancy-glow-pulse 4s infinite ease-in-out;
    transition: color 0.3s, font-size 0.3s; user-select: none; pointer-events: none;
    padding: 0 8px; line-height: 1;
}
.sb2-fancy-controls {
    display: flex; gap: 6px; align-items: center; justify-content: center;
    position: relative; z-index: 2; pointer-events: auto;
}
.sb2-fancy-slider {
    width: 100px; height: 3px;
    background: linear-gradient(90deg, rgba(115,0,255,0.4), rgba(115,0,255,0.1));
    border-radius: 3px; box-shadow: 0 0 8px var(--sb2-fancy-color, #7300ff);
    -webkit-appearance: none; outline: none; flex-shrink: 0;
}
.sb2-fancy-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px;
    background: var(--sb2-fancy-color, #7300ff); border-radius: 50%;
    box-shadow: 0 0 8px var(--sb2-fancy-color, #7300ff);
    cursor: pointer; border: none; transition: transform 0.2s;
}
.sb2-fancy-slider::-webkit-slider-thumb:hover { transform: scale(1.3); }
.sb2-fancy-color-btn {
    width: 16px; height: 16px;
    background: var(--sb2-fancy-color, #7300ff); border: none; border-radius: 50%;
    box-shadow: 0 0 8px var(--sb2-fancy-color, #7300ff);
    cursor: pointer; flex-shrink: 0; transition: transform 0.2s;
}
.sb2-fancy-color-btn:hover { transform: scale(1.2); }
.sb2-fancy-color-input { display: none; }

/* ── Knob wrapper (fills the DOM widget element ComfyUI gives us) ─────────── */
.sb2-knob-wrapper {
    font-family: 'Orbitron', monospace;
    user-select: none;
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    display: flex; flex-direction: column;
    align-items: center; justify-content: flex-start;
    pointer-events: none;
    overflow: visible;
}
.sb2-knob-wrapper:focus { outline: 2px solid var(--knob-color); outline-offset: 2px; }
.sb2-knob-wrapper [tabindex="0"]:focus { outline: 2px solid var(--knob-color, #0ff); outline-offset: 2px; }

.sb2-knob-header {
    width: 100%; display: flex; align-items: center; gap: 8px;
    padding: 5px; box-sizing: border-box; flex-shrink: 0;
    pointer-events: auto;
}
.sb2-knob-title {
    color: var(--knob-color, #0fff00); font-family: 'Orbitron', monospace;
    font-weight: bold; text-shadow: 0 0 8px var(--knob-color, #0fff00);
    pointer-events: none; flex: 1; text-align: left;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sb2-knob-settings-btn {
    background: rgba(255,255,255,0.1); color: var(--knob-color, #0fff00);
    border: 1px solid var(--knob-color, #0fff00); border-radius: 8px;
    cursor: pointer; transition: all 0.3s ease;
    display: flex; align-items: center; justify-content: center;
    pointer-events: auto;
}
.sb2-knob-settings-btn:hover {
    background: var(--knob-color, #0fff00); color: white;
    transform: scale(1.1); box-shadow: 0 0 15px var(--knob-color, #0fff00);
}

/* Shape containers */
.sb2-knob-wrapper .knob-container,
.sb2-knob-wrapper .vertical-slider-container,
.sb2-knob-wrapper .horizontal-slider-container {
    display: none; width: 100%; flex: 1; position: relative;
    pointer-events: auto; overflow: visible;
    align-items: center; justify-content: center;
}
.sb2-knob-wrapper.shape-knob            .knob-container             { display: flex; flex-direction: column; }
.sb2-knob-wrapper.shape-vertical_slider .vertical-slider-container  { display: flex; flex-direction: column; }
.sb2-knob-wrapper.shape-horizontal_slider .horizontal-slider-container { display: flex; flex-direction: column; }

/* Knob body */
.sb2-knob-wrapper .knob-body {
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #2a2a2a, #0f0f0f);
    position: relative; cursor: grab;
    box-shadow: inset 0 0 20px rgba(0,0,0,0.8), 0 8px 20px rgba(0,0,0,0.6), 0 0 0 3px rgba(255,255,255,0.1);
    display: flex; align-items: center; justify-content: center;
    transition: all 0.3s ease; overflow: visible; pointer-events: auto; margin: 10px 0;
}
.sb2-knob-wrapper .knob-body:hover {
    transform: scale(1.02);
    box-shadow: inset 0 0 20px rgba(0,0,0,0.8), 0 12px 25px rgba(0,0,0,0.7), 0 0 0 3px var(--knob-color, #0fff00);
}
.sb2-knob-wrapper .knob-body.dragging { cursor: ns-resize !important; transform: scale(1.08); }
.sb2-knob-wrapper .knob-body::before {
    content: ''; position: absolute; top: 10px; left: 10px; right: 10px; bottom: 10px;
    border-radius: 50%;
    background: conic-gradient(
        from 225deg, transparent 0deg,
        var(--knob-color, #0fff00) calc(var(--knob-progress, 30) * 2.7deg),
        transparent calc(var(--knob-progress, 30) * 2.7deg + 5deg)
    );
    opacity: 0.8;
}
.sb2-knob-wrapper .knob-indicator {
    width: 6px; background: linear-gradient(180deg, var(--knob-color, #0fff00), #ffffff);
    position: absolute; border-radius: 3px;
    box-shadow: 0 0 10px var(--knob-color, #0fff00); z-index: 2; pointer-events: none;
}
.sb2-knob-wrapper .knob-center-display {
    position: absolute; background: radial-gradient(circle, #1a1a1a, #000000);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    border: 2px solid var(--knob-color, #0fff00);
}
.sb2-knob-wrapper .knob-value {
    color: var(--knob-color, #0fff00); font-family: 'Orbitron', monospace;
    font-weight: bold; text-shadow: 0 0 10px var(--knob-color, #0fff00); text-align: center;
}

/* Corner step buttons */
.sb2-knob-corner-btn {
    position: absolute; z-index: 10; pointer-events: auto; border-radius: 50%;
    background: rgba(255,255,255,0.15); border: 1px solid var(--knob-color, #0fff00);
    color: var(--knob-color, #0fff00);
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s ease; box-shadow: 0 0 10px rgba(0,0,0,0.5); cursor: pointer;
}
.sb2-knob-corner-btn:hover {
    background: var(--knob-color, #0fff00); color: white; transform: scale(1.1);
    box-shadow: 0 0 15px var(--knob-color, #0fff00);
}

/* Vertical slider */
.sb2-knob-wrapper .slider-vertical-track {
    position: relative; border-radius: 15px;
    background: linear-gradient(180deg, #333, #1a1a1a);
    border: 2px solid var(--knob-color, #0fff00);
    box-shadow: inset 0 0 10px rgba(0,0,0,0.5); overflow: visible; pointer-events: auto;
}
.sb2-knob-wrapper .slider-vertical-thumb {
    position: absolute; left: 0; background: var(--knob-color, #0fff00);
    border-radius: 8px; cursor: ns-resize;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 10px var(--knob-color, #0fff00); pointer-events: auto; transition: box-shadow 0.2s;
}
.sb2-knob-wrapper .slider-vertical-thumb span { color: #000; font-weight: bold; pointer-events: none; }
.sb2-knob-wrapper .slider-vertical-thumb:hover,
.sb2-knob-wrapper .slider-vertical-thumb.dragging { box-shadow: 0 0 20px var(--knob-color, #0fff00); }

/* Horizontal slider */
.sb2-knob-wrapper .slider-horizontal-track {
    position: relative; border-radius: 15px;
    background: linear-gradient(90deg, #333, #1a1a1a);
    border: 2px solid var(--knob-color, #0fff00);
    box-shadow: inset 0 0 10px rgba(0,0,0,0.5); overflow: visible; pointer-events: auto;
}
.sb2-knob-wrapper .slider-horizontal-thumb {
    position: absolute; top: 0; background: var(--knob-color, #0fff00);
    border-radius: 8px; cursor: ew-resize;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 10px var(--knob-color, #0fff00); pointer-events: auto; transition: box-shadow 0.2s;
}
.sb2-knob-wrapper .slider-horizontal-thumb span { color: #000; font-weight: bold; pointer-events: none; }
.sb2-knob-wrapper .slider-horizontal-thumb:hover,
.sb2-knob-wrapper .slider-horizontal-thumb.dragging { box-shadow: 0 0 20px var(--knob-color, #0fff00); }

/* ── Theme overrides (scoped to .sb2-knob-wrapper) ───────────────────────── */
.sb2-knob-wrapper.theme-cyberpunk .knob-body {
    background: radial-gradient(circle at 30% 30%, #1a001a, #000);
    border: 2px solid #ff00ff; box-shadow: 0 0 30px #ff00ff, inset 0 0 20px #330033;
}
.sb2-knob-wrapper.theme-cyberpunk .knob-indicator { background: linear-gradient(180deg,#ff00ff,#fff); box-shadow: 0 0 15px #ff00ff; }
.sb2-knob-wrapper.theme-cyberpunk .knob-value { color: #ff00ff; text-shadow: 0 0 10px #ff00ff; }
.sb2-knob-wrapper.theme-cyberpunk .slider-vertical-track,
.sb2-knob-wrapper.theme-cyberpunk .slider-horizontal-track { border: 2px solid #ff00ff; box-shadow: 0 0 30px #ff00ff, inset 0 0 20px #330033; }
.sb2-knob-wrapper.theme-cyberpunk .slider-vertical-thumb,
.sb2-knob-wrapper.theme-cyberpunk .slider-horizontal-thumb { background: #ff00ff; box-shadow: 0 0 30px #ff00ff; }

.sb2-knob-wrapper.theme-steampunk .knob-body {
    background: radial-gradient(circle at 30% 30%, #7c5c2a, #3a2510);
    border: 4px solid #b57c48; box-shadow: inset 0 -8px 12px #3a2510, inset 0 8px 12px #e8c87a;
}
.sb2-knob-wrapper.theme-steampunk .knob-indicator { background: linear-gradient(180deg,#c9a87c,#8b6b4c); }
.sb2-knob-wrapper.theme-steampunk .knob-value { color: #4d2e1a; }
.sb2-knob-wrapper.theme-steampunk .slider-vertical-track,
.sb2-knob-wrapper.theme-steampunk .slider-horizontal-track { background: radial-gradient(circle,#b87c4b,#5d3a1a); border: 4px solid #c9a87c; }
.sb2-knob-wrapper.theme-steampunk .slider-vertical-thumb,
.sb2-knob-wrapper.theme-steampunk .slider-horizontal-thumb { background: #e5c687; border: 2px solid #b57c48; }

.sb2-knob-wrapper.theme-futuristic .knob-body {
    background: radial-gradient(circle at 30% 30%, #1a2f3f, #0a0f14);
    border: 2px solid #00aaff; box-shadow: 0 0 30px #00aaff, inset 0 0 20px #004466;
    clip-path: polygon(20% 0%,80% 0%,100% 20%,100% 80%,80% 100%,20% 100%,0% 80%,0% 20%);
}
.sb2-knob-wrapper.theme-futuristic .slider-vertical-track,
.sb2-knob-wrapper.theme-futuristic .slider-horizontal-track { border: 2px solid #00aaff; box-shadow: 0 0 30px #00aaff; }
.sb2-knob-wrapper.theme-futuristic .slider-vertical-thumb,
.sb2-knob-wrapper.theme-futuristic .slider-horizontal-thumb { background: #00aaff; box-shadow: 0 0 30px #00aaff; }

@keyframes sb2-rgbFlow { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
.sb2-knob-wrapper.theme-gaming .knob-body {
    background: linear-gradient(45deg,#ff0066,#00ff99,#0066ff); background-size: 200% 200%;
    animation: sb2-rgbFlow 4s linear infinite; border: none; box-shadow: 0 0 30px white;
}
.sb2-knob-wrapper.theme-gaming .knob-indicator { background: white; box-shadow: 0 0 20px white; }
.sb2-knob-wrapper.theme-gaming .slider-vertical-track,
.sb2-knob-wrapper.theme-gaming .slider-horizontal-track {
    background: linear-gradient(45deg,#ff0066,#00ff99,#0066ff); background-size: 200% 200%;
    animation: sb2-rgbFlow 4s linear infinite; border: none;
}
.sb2-knob-wrapper.theme-gaming .slider-vertical-thumb,
.sb2-knob-wrapper.theme-gaming .slider-horizontal-thumb { background: white; box-shadow: 0 0 20px white; }

.sb2-knob-wrapper.theme-dark .knob-body { background: #000; border: 2px solid #0ff; box-shadow: 0 0 15px #0ff; }
.sb2-knob-wrapper.theme-dark .knob-indicator { background: #0ff; box-shadow: none; }
.sb2-knob-wrapper.theme-dark .knob-value { color: #0ff; background: #000; border: 1px solid #0ff; }
.sb2-knob-wrapper.theme-dark .slider-vertical-track,
.sb2-knob-wrapper.theme-dark .slider-horizontal-track { border: 2px solid #0ff; box-shadow: 0 0 15px #0ff; }
.sb2-knob-wrapper.theme-dark .slider-vertical-thumb,
.sb2-knob-wrapper.theme-dark .slider-horizontal-thumb { background: #0ff; box-shadow: 0 0 15px #0ff; }

.sb2-knob-wrapper.theme-nature .knob-body {
    background: radial-gradient(circle at 30% 30%,#6b8e4c,#2d4a1e); border: 3px solid #4c6b3b;
}
.sb2-knob-wrapper.theme-cartoon .knob-body { background: #ffcc00; border: 4px solid #ff6600; border-radius: 50%; box-shadow: 0 8px 0 #aa4400; }
.sb2-knob-wrapper.theme-vaporwave .knob-body { background: linear-gradient(135deg,#ff7eb3,#7a5fff); border: 2px solid #fff; box-shadow: 0 0 30px #ff7eb3,0 0 60px #7a5fff; overflow: hidden; }
.sb2-knob-wrapper.theme-brutalist .knob-body { background: #fff; border: 3px solid #000; box-shadow: none; }
.sb2-knob-wrapper.theme-brutalist .knob-value { font-family: 'Impact',sans-serif; font-size: 2em; color: #000; }
.sb2-knob-wrapper.theme-material .knob-body { background: #fff; box-shadow: 0 3px 5px rgba(0,0,0,0.2),0 6px 10px rgba(0,0,0,0.14); border: none; }
.sb2-knob-wrapper.theme-neumorphism .knob-body { background: #e0e0e0; box-shadow: -8px -8px 15px #fff,8px 8px 15px #a3a3a3; border: none; }
.sb2-knob-wrapper.theme-skeuomorphic .knob-body {
    background: radial-gradient(circle at 30% 30%,#eee,#aaa);
    box-shadow: inset 0 -8px 12px rgba(0,0,0,0.5),inset 0 8px 12px rgba(255,255,255,0.8),0 12px 20px #333; border: 2px solid #888;
}
.sb2-knob-wrapper.theme-skeuomorphic .knob-indicator { background: linear-gradient(180deg,#f00,#600); box-shadow: 0 2px 4px #300; }

/* ── Modal ────────────────────────────────────────────────────────────────── */
.sb2-modal-overlay {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); z-index: 10000;
    display: none; align-items: center; justify-content: center;
    backdrop-filter: blur(5px);
}
.sb2-modal {
    background: linear-gradient(145deg,#2a2a2a,#1a1a1a); border: 2px solid var(--knob-color,#0fff00);
    border-radius: 15px; padding: 25px; display: flex; flex-direction: column; gap: 15px;
    min-width: 400px; max-width: 600px; box-shadow: 0 20px 40px rgba(0,0,0,0.8);
    font-family: 'Orbitron',monospace;
}
.sb2-modal-row { display: grid; grid-template-columns: 100px 1fr; align-items: center; gap: 15px; }
.sb2-modal-row label { color: rgba(255,255,255,0.8); font-size: 12px; font-weight: 500; }
.sb2-modal-row input, .sb2-modal-row select {
    background: rgba(0,0,0,0.5); border: 1px solid var(--knob-color,#0fff00);
    color: white; padding: 8px 12px; border-radius: 6px; font-size: 12px;
    font-family: 'Orbitron',monospace; transition: all 0.3s ease;
}
.sb2-modal-row select option { background: #2a2a2a; color: white; }
.sb2-modal-row input:focus, .sb2-modal-row select:focus { outline: none; border-color: #fff; box-shadow: 0 0 10px var(--knob-color,#0fff00); }
.sb2-theme-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; margin-top: 5px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; }
.sb2-theme-icon { aspect-ratio: 1/1; border-radius: 8px; cursor: pointer; transition: transform 0.2s,box-shadow 0.2s; border: 2px solid transparent; }
.sb2-theme-icon:hover { transform: scale(1.1); box-shadow: 0 0 15px currentColor; }
.sb2-theme-icon.selected { border-color: white; box-shadow: 0 0 20px white; }
.sb2-modal-buttons { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
.sb2-modal-btn {
    background: rgba(255,255,255,0.1); border: 1px solid var(--knob-color,#0fff00);
    border-radius: 6px; color: var(--knob-color,#0fff00); padding: 8px 16px;
    cursor: pointer; font-size: 12px; font-family: 'Orbitron',monospace;
    font-weight: 600; transition: all 0.3s ease; text-transform: uppercase;
}
.sb2-modal-btn:hover { background: var(--knob-color,#0fff00); color: white; }
.sb2-modal-btn.save { background: var(--knob-color,#0fff00); color: white; }
.sb2-modal-title { color: var(--knob-color,#0fff00); font-size: 16px; font-weight: 700; text-align: center; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }

/* ── Batcheur panel ───────────────────────────────────────────────────────── */
.sb2-batcheur-panel {
    width: 100%; height: 100%;
    background: #2a2a2a; padding: 10px 14px;
    display: flex; flex-direction: column; gap: 8px;
    box-sizing: border-box; overflow-y: auto; overflow-x: hidden;
}
.sb2-display-box {
    position: relative; flex: 3 1 auto; min-height: min-content;
    display: flex; flex-direction: column; justify-content: space-between;
    background: #111; padding: 10px 14px; border-radius: 4px;
    border: 1px solid #444; font-family: monospace;
    transition: all 0.4s cubic-bezier(0.175,0.885,0.32,1.275);
    overflow: hidden;
}
.sb2-display-box.frozen-ui {
    background: linear-gradient(135deg,#0e1c26 0%,#2a4552 100%);
    border: 1px solid #00f2ff; box-shadow: inset 0 0 15px #00f2ff66, 0 0 12px #00f2ff44;
}
.sb2-display-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 3px 0; font-weight: bold; font-size: 15px;
    line-height: 1.35; color: #ccc; flex-shrink: 0;
}
.sb2-display-row span:last-child { color: #4caf50; }
.sb2-display-box.frozen-ui .sb2-display-row span:last-child { color: #ff4444; }
.sb2-filename-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 2px 0; font-size: 11px; color: #888; flex-shrink: 0;
}
.sb2-filename-row span:last-child {
    color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1; text-align: right; margin-left: 8px;
}
.sb2-success-mark {
    display: inline-block; margin-left: 8px; opacity: 0; transform: scale(0);
    transition: all 0.3s cubic-bezier(0.175,0.885,0.32,1.275);
}
.sb2-show-check .sb2-success-mark { opacity: 1; transform: scale(1.2); }
.sb2-btn-set {
    flex: 2 1 auto; padding: 4px 9px; cursor: pointer;
    background: linear-gradient(to bottom,#44a047,#2e7d32) !important;
    color: white !important; border: 1px solid #1b5e20 !important;
    border-radius: 3px; font-size: 13px; text-transform: uppercase;
    font-weight: bold; transition: all 0.2s; position: relative; z-index: 2;
    display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.sb2-btn-set:hover { background: linear-gradient(to bottom,#4caf50,#357a38) !important; box-shadow: 0 0 8px #4caf5066; }
.sb2-freeze-btn {
    flex: 0 0 auto; padding: 9px; cursor: pointer;
    background: linear-gradient(to bottom,#a0d8ef,#00bfff) !important;
    color: #fff !important; border: 1px solid #fff !important;
    box-shadow: 0 0 10px #00bfff66; border-radius: 3px;
    transition: all 0.3s ease; text-transform: uppercase;
    font-size: 13px; font-weight: bold; position: relative; z-index: 2;
}
.sb2-freeze-btn:hover { box-shadow: 0 0 15px #00bfff99; }
.sb2-freeze-btn.frozen { background: #34495e !important; color: #a0d8ef !important; border: 1px solid #5d8aa8 !important; box-shadow: none !important; }
.sb2-row {
    display: flex; align-items: center; width: 100%; gap: 8px; flex: 0 0 auto; z-index: 2; position: relative;
}
.sb2-row label { flex: 0 0 72px; font-size: 11px; color: #888; text-transform: uppercase; }
.sb2-input {
    flex: 1; background: #181818; color: #fff; border: 1px solid #444;
    border-radius: 3px; padding: 6px; font-size: 13px; outline: none;
    transition: border-color 0.2s; min-width: 0;
}
.sb2-input:focus { border-color: #666; }
.sb2-padding-input { flex: 0 0 60px; width: 60px; text-align: center; }
.sb2-ice-crack {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    pointer-events: none; opacity: 0;
    background: radial-gradient(circle,transparent 30%,white 100%),
        linear-gradient(45deg,transparent 45%,#fff 50%,transparent 55%),
        linear-gradient(-45deg,transparent 45%,#fff 50%,transparent 55%);
    background-size: 100% 100%,20px 20px,20px 20px; filter: blur(1px);
}
@keyframes sb2-ice-shatter { 0% { opacity: 0.8; transform: scale(1); } 100% { opacity: 0; transform: scale(1.1); } }
.sb2-shatter { animation: sb2-ice-shatter 0.5s ease-out forwards; }
`;
document.head.appendChild(style);

// ─── Extension ───────────────────────────────────────────────────────────────

app.registerExtension({
    name: "SuperBatcheur2",

    setup() {
        api.addEventListener("superbatcheur2_executed", (e) => {
            const node = app.graph.getNodeById(Number(e.detail.node_id));
            if (!node?._sb2) return;
            // send_sync broadcasts to every connected browser tab, and node_id
            // (LiteGraph's unique_id) is only unique within a single graph —
            // two different open workflows can share an id. Only skip the
            // update when BOTH sides have a real uuid and they disagree;
            // if either side lacks one (e.g. a workflow saved before this
            // field existed), fall back to the old node_id-only matching so
            // older saved nodes don't silently stop updating.
            if (e.detail.node_uuid && node.properties?.uuid && e.detail.node_uuid !== node.properties.uuid) {
                return;
            }
            const wIdx = node.widgets?.find((w) => w.name === "current_index");
            if (wIdx) wIdx.value = e.detail.next;
            node._sb2.updateBatcheur(
                e.detail.current,
                e.detail.next,
                e.detail.pix_filename    || "",
                e.detail.prompt_filename || "",
                e.detail.padded_index    || String(e.detail.current)
            );
        });
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "SuperBatcheur2") return;

        // LiteGraph's default clone() copies `properties` verbatim (it only
        // strips id/pos), so a duplicated node would otherwise inherit the
        // exact same node_uuid as the original — recreating the same-graph
        // version of the collision this fix exists to prevent. Give every
        // clone a fresh identity.
        const origClone = nodeType.prototype.clone;
        nodeType.prototype.clone = function () {
            const cloned = origClone ? origClone.apply(this, arguments) : null;
            if (cloned) {
                cloned.properties = cloned.properties || {};
                cloned.properties.uuid = generateNodeUUID();
                const w = cloned.widgets?.find((w2) => w2.name === "node_uuid");
                if (w) w.value = cloned.properties.uuid;
            }
            return cloned;
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            // ══════════════════════════════════════════════════════════════
            //  Widget 1 — Fancy Note strip (padded_index display)
            // ══════════════════════════════════════════════════════════════
            const fancyStrip = document.createElement("div");
            fancyStrip.className = "sb2-fancy-strip";
            const fancyText = document.createElement("div");
            fancyText.className = "sb2-fancy-text";
            fancyText.textContent = "000";

            // Controls row: font-size slider + color picker
            const fancyControls  = document.createElement("div");
            fancyControls.className = "sb2-fancy-controls";
            const fancySizeSlider = document.createElement("input");
            fancySizeSlider.type = "range"; fancySizeSlider.min = "12"; fancySizeSlider.max = "750";
            fancySizeSlider.value = "12"; fancySizeSlider.className = "sb2-fancy-slider";
            const fancyColorBtn   = document.createElement("button");
            fancyColorBtn.className = "sb2-fancy-color-btn"; fancyColorBtn.title = "Change colour";
            const fancyColorInput = document.createElement("input");
            fancyColorInput.type = "color"; fancyColorInput.className = "sb2-fancy-color-input";
            fancyColorInput.value = "#7300ff";
            fancyControls.appendChild(fancySizeSlider);
            fancyControls.appendChild(fancyColorBtn);
            fancyControls.appendChild(fancyColorInput);

            fancyStrip.appendChild(fancyControls);
            fancyStrip.appendChild(fancyText);

            this.addDOMWidget("sb2_fancy", "div", fancyStrip, {
                serialize: false,
                computeSize: () => [this.size?.[0] ?? 260, FANCY_NOTE_HEIGHT],
            });

            // ══════════════════════════════════════════════════════════════
            //  Widget 2 — Knob (own DOM widget so ComfyUI gives it real px)
            // ══════════════════════════════════════════════════════════════
            const kWrapper = document.createElement("div");
            kWrapper.className = "sb2-knob-wrapper";
            kWrapper.tabIndex = 0;

            // Header
            const kHeader    = document.createElement("div");    kHeader.className    = "sb2-knob-header";
            const kTitle     = document.createElement("div");    kTitle.className     = "sb2-knob-title";
            const kGearBtn   = document.createElement("button"); kGearBtn.className   = "sb2-knob-settings-btn"; kGearBtn.innerHTML = "⚙";
            kHeader.appendChild(kTitle); kHeader.appendChild(kGearBtn);
            kWrapper.appendChild(kHeader);

            // Knob shape
            const kKnobCont  = document.createElement("div"); kKnobCont.className  = "knob-container";
            const kBody      = document.createElement("div"); kBody.className      = "knob-body"; kBody.tabIndex = 0; kBody.setAttribute("role","slider");
            const kIndicator = document.createElement("div"); kIndicator.className = "knob-indicator";
            const kCenter    = document.createElement("div"); kCenter.className    = "knob-center-display";
            const kValLabel  = document.createElement("div"); kValLabel.className  = "knob-value";
            kCenter.appendChild(kValLabel); kBody.appendChild(kIndicator); kBody.appendChild(kCenter);
            kKnobCont.appendChild(kBody); kWrapper.appendChild(kKnobCont);

            // Vertical slider shape
            const kVCont  = document.createElement("div"); kVCont.className  = "vertical-slider-container";
            const kVTrack = document.createElement("div"); kVTrack.className = "slider-vertical-track";
            const kVThumb = document.createElement("div"); kVThumb.className = "slider-vertical-thumb"; kVThumb.tabIndex = 0; kVThumb.setAttribute("role","slider");
            const kVSpan  = document.createElement("span");
            kVThumb.appendChild(kVSpan); kVTrack.appendChild(kVThumb); kVCont.appendChild(kVTrack); kWrapper.appendChild(kVCont);

            // Horizontal slider shape
            const kHCont  = document.createElement("div"); kHCont.className  = "horizontal-slider-container";
            const kHTrack = document.createElement("div"); kHTrack.className = "slider-horizontal-track";
            const kHThumb = document.createElement("div"); kHThumb.className = "slider-horizontal-thumb"; kHThumb.tabIndex = 0; kHThumb.setAttribute("role","slider");
            const kHSpan  = document.createElement("span");
            kHThumb.appendChild(kHSpan); kHTrack.appendChild(kHThumb); kHCont.appendChild(kHTrack); kWrapper.appendChild(kHCont);

            // Step buttons
            const kMinus = document.createElement("button"); kMinus.className = "sb2-knob-corner-btn";
            const kPlus  = document.createElement("button"); kPlus.className  = "sb2-knob-corner-btn";
            kWrapper.appendChild(kMinus); kWrapper.appendChild(kPlus);

            const knobDOMWidget = this.addDOMWidget("sb2_knob", "div", kWrapper, {
                serialize: false,
                computeSize: () => {
                    const nodeW = this.size?.[0] ?? 260;
                    // Total node height minus the other two panels (fancy strip + batcheur panel)
                    // plus ComfyUI's title bar (~30px) and small padding.
                    const nodeH = this.size?.[1] ?? (FANCY_NOTE_HEIGHT + KNOB_HEIGHT + 280 + 30);
                    const otherH = FANCY_NOTE_HEIGHT + 280 + 30;
                    const available = Math.max(KNOB_HEIGHT, nodeH - otherH);
                    return [nodeW, available];
                },
            });
            // ComfyUI wraps our element; we observe the wrapper for layout
            const knobElement = knobDOMWidget.element;
            knobElement.style.position = "relative";
            knobElement.style.overflow = "visible";

            // Modal overlay
            const modalOverlay = document.createElement("div");
            modalOverlay.className = "sb2-modal-overlay";
            document.body.appendChild(modalOverlay);

            // ══════════════════════════════════════════════════════════════
            //  Widget 3 — Batcheur controls panel
            // ══════════════════════════════════════════════════════════════
            const panel = document.createElement("div");
            panel.className = "sb2-batcheur-panel";
            panel.innerHTML = `
                <div class="sb2-display-box">
                    <div class="sb2-ice-crack"></div>
                    <div class="sb2-display-row"><span>LAST:</span><span class="sb2-cur-val">0</span></div>
                    <div class="sb2-display-row"><span>NEXT:</span><span class="sb2-nxt-val">0</span></div>
                    <div class="sb2-filename-row"><span>PIX:</span><span class="sb2-pix-fn" title="">-</span></div>
                    <div class="sb2-filename-row"><span>TXT:</span><span class="sb2-txt-fn" title="">-</span></div>
                </div>
                <button class="sb2-btn-set">Set Next <span class="sb2-success-mark">✓</span></button>
                <button class="sb2-freeze-btn">Freeze</button>
                <div class="sb2-row"><label>Padding</label><input type="number" class="sb2-input sb2-padding-input" min="1" max="12" value="3"></div>
            `;

            const PANEL_HEIGHT = 280;
            this.addDOMWidget("sb2_panel", "div", panel, {
                serialize: false,
                computeSize: () => [this.size?.[0] ?? 260, PANEL_HEIGHT],
            });

            // ── DOM refs ──────────────────────────────────────────────────
            const displayBox  = panel.querySelector(".sb2-display-box");
            const iceCrack    = panel.querySelector(".sb2-ice-crack");
            const curValEl    = panel.querySelector(".sb2-cur-val");
            const nxtValEl    = panel.querySelector(".sb2-nxt-val");
            const pixFnEl     = panel.querySelector(".sb2-pix-fn");
            const txtFnEl     = panel.querySelector(".sb2-txt-fn");
            const setBtn      = panel.querySelector(".sb2-btn-set");
            const freezeBtn   = panel.querySelector(".sb2-freeze-btn");
            const paddingEl   = panel.querySelector(".sb2-padding-input");

            // ── Public API stored on node ─────────────────────────────────
            this._sb2 = {
                updateBatcheur: (current, next, pixFn, txtFn, paddedIdx) => {
                    curValEl.textContent  = current;
                    nxtValEl.textContent  = next;
                    pixFnEl.textContent   = pixFn  || "-"; pixFnEl.title  = pixFn  || "";
                    txtFnEl.textContent   = txtFn  || "-"; txtFnEl.title  = txtFn  || "";
                    fancyText.textContent = paddedIdx !== undefined ? paddedIdx : String(current);
                },
                setFancyColor: (color) => {
                    fancyStrip.style.setProperty("--sb2-fancy-color", color);
                    fancyColorBtn.style.background = color;
                    fancyColorInput.value = color;
                },
            };

            // ── Knob layout (reads knobElement's real ComfyUI-assigned dims) ──
            const updateKnobLayout = () => {
                const w = knobElement.clientWidth;
                const h = knobElement.clientHeight;
                if (w === 0 || h === 0) return;

                const btnSize = Math.max(20, Math.min(4000, Math.min(w, h) * 0.08));
                kGearBtn.style.width = kGearBtn.style.height = btnSize + "px";
                kGearBtn.style.fontSize = (btnSize * 0.6) + "px";
                kTitle.style.fontSize   = (btnSize * 0.5) + "px";
                kTitle.style.lineHeight = btnSize + "px";

                const headerH   = btnSize + 10;
                const availH    = h - headerH;
                const knobSize  = Math.min(w * 0.98, availH * 0.98);

                kBody.style.width = kBody.style.height = knobSize + "px";
                kWrapper.style.setProperty("--knob-size", knobSize + "px");

                const indH  = knobSize * 0.25;
                const indTop = knobSize * 0.107;
                kIndicator.style.height = indH + "px";
                kIndicator.style.width  = (knobSize * 0.043) + "px";
                kIndicator.style.top    = indTop + "px";
                kIndicator.style.left   = `calc(50% - ${knobSize * 0.0215}px)`;
                kIndicator.style.transformOrigin = `center ${(knobSize / 2) - indTop}px`;

                const centerSz = knobSize * 0.714;
                kCenter.style.width = kCenter.style.height = centerSz + "px";
                kValLabel.style.fontSize = (knobSize * 0.114) + "px";

                const cbSz = knobSize / 7;
                kMinus.style.width = kPlus.style.width   = cbSz + "px";
                kMinus.style.height = kPlus.style.height = cbSz + "px";
                kMinus.style.fontSize = kPlus.style.fontSize = (cbSz * 0.6) + "px";
                // Position at bottom corners of knob circle
                const cx = w / 2;
                const knobTop = headerH + (availH - knobSize) / 2;
                const knobBot = knobTop + knobSize;
                const mg = cbSz * 0.3;
                kMinus.style.left = (cx - knobSize / 2 - cbSz / 2 - mg) + "px";
                kMinus.style.top  = (knobBot - cbSz - mg) + "px";
                kPlus.style.left  = (cx + knobSize / 2 - cbSz / 2 + mg) + "px";
                kPlus.style.top   = (knobBot - cbSz - mg) + "px";

                // Vertical slider
                const vH = availH * 0.7;
                kVTrack.style.height = vH + "px"; kVTrack.style.width = "30px";
                const vTh = Math.max(20, vH * 0.1);
                kVThumb.style.height = vTh + "px"; kVThumb.style.width = "40px"; kVThumb.style.left = "-5px";
                kVSpan.style.fontSize = (vTh * 0.5) + "px";

                // Horizontal slider
                const hW = w * 0.8;
                kHTrack.style.width = hW + "px"; kHTrack.style.height = "30px";
                const hTw = Math.max(20, hW * 0.05);
                kHThumb.style.width = hTw + "px"; kHThumb.style.height = "40px"; kHThumb.style.top = "-5px";
                kHSpan.style.fontSize = (hTw * 0.5) + "px";

                updateSliderPositions();
            };

            // ── Knob visuals ──────────────────────────────────────────────
            let knobValueWidget = null; // set in setTimeout
            // Collects teardown functions (document-level listeners, observers)
            // that must run in onRemoved or they leak for the rest of the session.
            const _sb2Cleanup = [];

            const updateSliderPositions = () => {
                if (!knobValueWidget || !this.properties) return;
                const { min, max } = this.properties;
                const pct = (knobValueWidget.value - min) / ((max - min) || 1);
                const vH   = parseFloat(kVTrack.style.height) || 100;
                const vTh  = parseFloat(kVThumb.style.height) || 20;
                kVThumb.style.top = ((1 - pct) * (vH - vTh)) + "px";
                kVSpan.textContent = knobValueWidget.value;
                const hW  = parseFloat(kHTrack.style.width) || 100;
                const hTw = parseFloat(kHThumb.style.width) || 20;
                kHThumb.style.left = (pct * (hW - hTw)) + "px";
                kHSpan.textContent = knobValueWidget.value;
            };

            const updateKnobVisuals = () => {
                if (!knobValueWidget || !this.properties) return;
                const { title, color, min, max, stepper } = this.properties;
                kTitle.textContent = title || "";
                kWrapper.style.setProperty("--knob-color", color || "#0fff00");
                kMinus.textContent = `-${stepper}`;
                kPlus.textContent  = `+${stepper}`;
                const pct = (knobValueWidget.value - min) / ((max - min) || 1);
                kIndicator.style.transform = `rotate(${-135 + pct * 270}deg)`;
                kValLabel.textContent = knobValueWidget.value;
                kBody.style.setProperty("--knob-progress", pct * 100);
                updateSliderPositions();
                for (const el of [kBody, kVThumb, kHThumb]) {
                    el.setAttribute("aria-valuemin", min);
                    el.setAttribute("aria-valuemax", max);
                    el.setAttribute("aria-valuenow", knobValueWidget.value);
                    el.setAttribute("aria-valuetext", String(knobValueWidget.value));
                }
            };

            const updateFancyText = () => {
                const pad = parseInt(paddingEl?.value, 10) || 3;
                fancyText.textContent = String(knobValueWidget?.value ?? 0).padStart(pad, "0");
            };

            // ── ResizeObserver on the ComfyUI element (has real dims) ─────
            const knobResizeObserver = new ResizeObserver(() => updateKnobLayout());
            knobResizeObserver.observe(knobElement);
            _sb2Cleanup.push(() => knobResizeObserver.disconnect());

            // ── ResizeObserver on the panel for responsive font scaling ───
            const updatePanelFonts = () => {
                const w = panel.clientWidth;
                if (w === 0) return;

                // Scale factor: 260px node = 1.0 baseline
                const scale = Math.max(0.6, Math.min(3.0, w / 260));

                // Display rows (LAST / NEXT values)
                const displayRowSize = Math.round(15 * scale);
                panel.querySelectorAll(".sb2-display-row").forEach(el => {
                    el.style.fontSize = displayRowSize + "px";
                });

                // Filename rows (PIX / TXT)
                const fnRowSize = Math.round(11 * scale);
                panel.querySelectorAll(".sb2-filename-row").forEach(el => {
                    el.style.fontSize = fnRowSize + "px";
                });

                // Buttons — Set Next font fills its button height
                const freezeBtnSize = Math.round(13 * scale);
                if (freezeBtn) { freezeBtn.style.fontSize = freezeBtnSize + "px"; }
                if (setBtn) {
                    // Let layout settle, then fill the button with the largest font that fits
                    requestAnimationFrame(() => {
                        const btnH = setBtn.clientHeight;
                        if (btnH > 0) {
                            // ~0.55 gives single-line text a comfortable fit inside the button
                            const fillSize = Math.max(11, Math.floor(btnH * 0.55));
                            setBtn.style.fontSize = fillSize + "px";
                        }
                    });
                }

                // Row labels & inputs
                const labelSize = Math.round(11 * scale);
                const inputSize = Math.round(13 * scale);
                panel.querySelectorAll(".sb2-row label").forEach(el => {
                    el.style.fontSize = labelSize + "px";
                });
                panel.querySelectorAll(".sb2-input").forEach(el => {
                    el.style.fontSize = inputSize + "px";
                });
            };

            const panelResizeObserver = new ResizeObserver(() => updatePanelFonts());
            panelResizeObserver.observe(panel);
            _sb2Cleanup.push(() => panelResizeObserver.disconnect());

            // ── Deferred wiring ───────────────────────────────────────────
            setTimeout(() => {
                const getW = (name) => this.widgets?.find((w) => w.name === name);

                // Knob widget
                knobValueWidget = getW("knobValue");
                if (knobValueWidget) { knobValueWidget.hidden = true; knobValueWidget.computeSize = () => [0, -4]; }

                // Stable per-node identity (see node_uuid in superbatcheur2.py).
                // node.properties.uuid is the source of truth — it's restored
                // automatically when a saved workflow loads, before this runs.
                // If it's missing (brand-new node, or a workflow saved before
                // this field existed) a fresh one is generated and persisted.
                const nodeUuidWidget = getW("node_uuid");
                if (nodeUuidWidget) { nodeUuidWidget.hidden = true; nodeUuidWidget.computeSize = () => [0, -4]; }

                // Serialisation widgets for theme/shape
                const themeW = this.addWidget("hidden", "sb2_theme", "cyberpunk", () => {}, { hidden: true });
                const shapeW = this.addWidget("hidden", "sb2_shape", "knob",      () => {}, { hidden: true });

                this.properties = this.properties || {};
                this.properties.uuid    = this.properties.uuid    || generateNodeUUID();
                this.properties.title   = this.properties.title   || "";
                this.properties.color   = this.properties.color   || "#0fff00";
                this.properties.min     = this.properties.min     ?? (knobValueWidget?.options?.min ?? 1);
                this.properties.max     = this.properties.max     ?? KNOB_DEFAULT_MAX;
                // applyKnobValue divides by stepper, so guard against 0/negative/
                // non-numeric saved values too, not just null/undefined (`?? 1`
                // alone would let a corrupted or hand-edited stepper: 0 through,
                // producing NaN/Infinity on every value computation).
                this.properties.stepper = (this.properties.stepper > 0) ? this.properties.stepper : 1;
                if (nodeUuidWidget) nodeUuidWidget.value = this.properties.uuid;

                const applyTheme = (theme) => {
                    kWrapper.classList.remove(...THEMES.map(t => `theme-${t}`));
                    kWrapper.classList.add(`theme-${theme}`);
                    if (themeW) themeW.value = theme;
                    this._sb2?.setFancyColor(this.properties.color || "#0fff00");
                };
                const applyShape = (shape) => {
                    kWrapper.classList.remove(...SHAPES.map(s => `shape-${s}`));
                    kWrapper.classList.add(`shape-${shape}`);
                    if (shapeW) shapeW.value = shape;
                    updateKnobLayout();
                };
                applyTheme(themeW?.value || "cyberpunk");
                applyShape(shapeW?.value || "knob");

                const applyKnobValue = (v) => {
                    if (!knobValueWidget) return;
                    const { min, max, stepper } = this.properties;
                    const stepped = Math.round(Math.max(min, Math.min(max, v)) / stepper) * stepper;
                    knobValueWidget.value = stepped;
                    knobValueWidget.callback?.(stepped);
                    updateKnobVisuals();
                };

                updateKnobVisuals();
                updateKnobLayout();

                // Shared drag-binding helper: wires up mousedown (on dragEl) ->
                // document-level mousemove/mouseup -> optional click (on a
                // separate clickEl, e.g. a slider's track vs its thumb), and
                // registers the document listeners for teardown in onRemoved.
                // Each call site only supplies its own position/delta -> value
                // math via onStart/onMove/onClick.
                const bindDragControl = (dragEl, { onStart, onMove, clickEl, onClick } = {}) => {
                    let dragging = false;
                    dragEl.addEventListener("mousedown", (e) => {
                        if (e.button !== 0) return;
                        dragging = true; dragEl.classList.add("dragging");
                        onStart?.(e);
                        e.preventDefault(); e.stopPropagation();
                    });
                    const move = (e) => { if (!dragging) return; onMove(e); e.preventDefault(); };
                    const up   = (e) => { if (!dragging) return; dragging = false; dragEl.classList.remove("dragging"); e.preventDefault(); };
                    document.addEventListener("mousemove", move);
                    document.addEventListener("mouseup", up);
                    if (clickEl && onClick) clickEl.addEventListener("click", onClick);
                    _sb2Cleanup.push(() => {
                        document.removeEventListener("mousemove", move);
                        document.removeEventListener("mouseup", up);
                    });
                };

                // Knob: relative drag (delta since last mouse position) + wheel
                let lastY = 0;
                bindDragControl(kBody, {
                    onStart: (e) => { lastY = e.clientY; },
                    onMove: (e) => {
                        const delta = lastY - e.clientY; lastY = e.clientY;
                        applyKnobValue((knobValueWidget?.value || 0) + delta * ((this.properties.max - this.properties.min) / 300));
                    },
                });
                kBody.addEventListener("wheel", (e) => {
                    e.preventDefault();
                    applyKnobValue((knobValueWidget?.value || 0) - Math.sign(e.deltaY) * ((this.properties.max - this.properties.min) / 100));
                });

                // Vertical slider: absolute position within the track, Y-axis
                // inverted (top of track = max, bottom = min)
                const verticalValueFromEvent = (e) => {
                    const rect = kVTrack.getBoundingClientRect();
                    return this.properties.min + (1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))) * (this.properties.max - this.properties.min);
                };
                bindDragControl(kVThumb, {
                    onMove: (e) => applyKnobValue(verticalValueFromEvent(e)),
                    clickEl: kVTrack,
                    onClick: (e) => applyKnobValue(verticalValueFromEvent(e)),
                });

                // Horizontal slider: absolute position within the track,
                // X-axis not inverted (left of track = min, right = max)
                const horizontalValueFromEvent = (e) => {
                    const rect = kHTrack.getBoundingClientRect();
                    return this.properties.min + Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * (this.properties.max - this.properties.min);
                };
                bindDragControl(kHThumb, {
                    onMove: (e) => applyKnobValue(horizontalValueFromEvent(e)),
                    clickEl: kHTrack,
                    onClick: (e) => applyKnobValue(horizontalValueFromEvent(e)),
                });

                kMinus.addEventListener("click", (e) => { applyKnobValue((knobValueWidget?.value || 0) - this.properties.stepper); e.preventDefault(); e.stopPropagation(); });
                kPlus.addEventListener("click",  (e) => { applyKnobValue((knobValueWidget?.value || 0) + this.properties.stepper); e.preventDefault(); e.stopPropagation(); });

                kWrapper.addEventListener("keydown", (e) => {
                    if (e.key === "ArrowUp"   || e.key === "ArrowRight") { applyKnobValue((knobValueWidget?.value || 0) + this.properties.stepper); e.preventDefault(); }
                    if (e.key === "ArrowDown" || e.key === "ArrowLeft")  { applyKnobValue((knobValueWidget?.value || 0) - this.properties.stepper); e.preventDefault(); }
                });

                // Gear / settings modal
                kGearBtn.addEventListener("click", (e) => {
                    buildModal(modalOverlay, this.properties, themeW, shapeW, applyTheme, applyShape, applyKnobValue, knobValueWidget);
                    modalOverlay.style.display = "flex";
                    e.preventDefault(); e.stopPropagation();
                });

                // ── Batcheur wiring ────────────────────────────────────────
                const w_index   = getW("current_index");
                const w_freeze  = getW("freeze");
                const w_padding = getW("padding");
                const w_reset   = getW("reset_trigger");

                // NOTE: pix_path/txt_path are forceInput optional STRING inputs,
                // so they never get added to this.widgets in the first place —
                // confirmed live via console logging (this.widgets consistently
                // excluded them both before and after the splice that used to
                // be here). No cleanup needed for them.

                this.widgets.forEach((w) => {
                    if (!["sb2_fancy","sb2_knob","sb2_panel"].includes(w.name)) {
                        w.hidden = true; w.computeSize = () => [0, -4];
                    }
                });

                if (w_padding) paddingEl.value = w_padding.value;

                // ── syncFreezeUI must be defined before first use ──────────
                const syncFreezeUI = (frozen) => {
                    freezeBtn.classList.toggle("frozen", frozen);
                    displayBox.classList.toggle("frozen-ui", frozen);
                    freezeBtn.textContent = frozen ? "FROZEN" : "Freeze";
                };

                if (w_freeze) syncFreezeUI(w_freeze.value);

                // Initialise fancy text now that padding is known
                updateFancyText();

                // ── Restore persisted fancy size + color from properties ───
                if (this.properties.fancySize) {
                    fancySizeSlider.value = this.properties.fancySize;
                    fancyText.style.fontSize = this.properties.fancySize + "px";
                }
                if (this.properties.fancyColor) {
                    this._sb2.setFancyColor(this.properties.fancyColor);
                }

                // ── Fancy strip: size slider + color picker ────────────────
                fancySizeSlider.addEventListener("input", () => {
                    fancyText.style.fontSize = fancySizeSlider.value + "px";
                    this.properties.fancySize = fancySizeSlider.value;
                });
                fancyColorBtn.addEventListener("click", (e) => {
                    e.preventDefault(); e.stopPropagation(); fancyColorInput.click();
                });
                fancyColorInput.addEventListener("input", () => {
                    this._sb2.setFancyColor(fancyColorInput.value);
                    this.properties.fancyColor = fancyColorInput.value;
                });

                // ── Padding input ──────────────────────────────────────────
                paddingEl.addEventListener("input", () => {
                    let v = parseInt(paddingEl.value, 10);
                    if (isNaN(v)) return;
                    v = Math.max(1, Math.min(12, v));
                    paddingEl.value = v;
                    if (w_padding) w_padding.value = v;
                    updateFancyText();
                });
                paddingEl.addEventListener("blur", () => {
                    let v = parseInt(paddingEl.value, 10);
                    if (isNaN(v)) v = 3;
                    v = Math.max(1, Math.min(12, v));
                    paddingEl.value = v;
                    if (w_padding) w_padding.value = v;
                    updateFancyText();
                });

                freezeBtn.addEventListener("click", () => {
                    if (!w_freeze) return;
                    w_freeze.value = !w_freeze.value;
                    if (!w_freeze.value) { iceCrack.classList.remove("sb2-shatter"); void iceCrack.offsetWidth; iceCrack.classList.add("sb2-shatter"); }
                    if (w_index) {
                        const cur  = parseInt(curValEl.textContent, 10) || 0;
                        const next = w_freeze.value ? cur : cur + 1;
                        w_index.value = next; nxtValEl.textContent = next;
                    }
                    syncFreezeUI(w_freeze.value);
                });

                setBtn.addEventListener("click", () => {
                    if (!knobValueWidget) return;
                    // Clamp to the knob's actual configured range, not a hardcoded
                    // 0-999999 — otherwise customizing min/max in the settings
                    // modal doesn't actually bound what Set Next can push through.
                    const lo = this.properties?.min ?? 0;
                    const hi = this.properties?.max ?? KNOB_DEFAULT_MAX;
                    const v = Math.max(lo, Math.min(hi, Math.round(knobValueWidget.value) || 0));
                    // Set current_index so Python uses knob value on next execution
                    if (w_index) w_index.value = v;
                    // Bump reset_trigger so IS_CHANGED fires and Python resets to v
                    if (w_reset) w_reset.value = (w_reset.value || 0) + 1;
                    // Update display
                    nxtValEl.textContent = v;
                    const pad = parseInt(paddingEl?.value, 10) || 3;
                    fancyText.textContent = String(v).padStart(pad, "0");
                    setBtn.classList.add("sb2-show-check");
                    setTimeout(() => setBtn.classList.remove("sb2-show-check"), 1000);
                });

                // Sync configure
                const origConfigure = this.onConfigure;
                this.onConfigure = function (data) {
                    origConfigure?.apply(this, arguments);
                    if (data.properties) {
                        applyTheme(themeW?.value || "cyberpunk");
                        applyShape(shapeW?.value || "knob");
                        // Restore (or backfill) the stable per-node uuid
                        this.properties.uuid = this.properties.uuid || generateNodeUUID();
                        if (nodeUuidWidget) nodeUuidWidget.value = this.properties.uuid;
                        // Re-guard stepper in case this configure() restored a
                        // saved properties blob with a bad value (see the same
                        // guard at initial setup above)
                        this.properties.stepper = (this.properties.stepper > 0) ? this.properties.stepper : 1;
                        // Restore persisted fancy display size
                        if (this.properties.fancySize) {
                            fancySizeSlider.value = this.properties.fancySize;
                            fancyText.style.fontSize = this.properties.fancySize + "px";
                        }
                        // Restore persisted fancy display color
                        if (this.properties.fancyColor) {
                            this._sb2?.setFancyColor(this.properties.fancyColor);
                        }
                    }
                    updateKnobVisuals(); updateKnobLayout(); updateFancyText();
                };

            }, 50);

            // Cleanup
            const origRemoved = this.onRemoved;
            this.onRemoved = function () {
                if (modalOverlay?.parentNode) modalOverlay.parentNode.removeChild(modalOverlay);
                // Tear down document-level drag listeners and ResizeObservers
                // registered above — without this they outlive the node for
                // the rest of the session.
                for (const fn of _sb2Cleanup) {
                    try { fn(); } catch (err) { console.warn("[SuperBatcheur2] cleanup error:", err); }
                }
                origRemoved?.apply(this, arguments);
            };
        };
    },
});

// ─── Settings modal builder ───────────────────────────────────────────────────

function buildModal(overlay, props, themeW, shapeW, applyTheme, applyShape, applyKnobValue, knobValueWidget) {
    overlay.innerHTML = "";
    const modal = document.createElement("div");
    modal.className = "sb2-modal";
    modal.style.setProperty("--knob-color", props.color || "#0fff00");

    const titleEl = document.createElement("div"); titleEl.className = "sb2-modal-title"; titleEl.textContent = "Knob Settings";
    modal.appendChild(titleEl);

    const row = (label, input) => {
        const r = document.createElement("div"); r.className = "sb2-modal-row";
        const l = document.createElement("label"); l.textContent = label;
        r.appendChild(l); r.appendChild(input); return r;
    };

    const titleIn  = Object.assign(document.createElement("input"), { type: "text" });
    const minIn    = Object.assign(document.createElement("input"), { type: "number", step: "1" });
    const maxIn    = Object.assign(document.createElement("input"), { type: "number", step: "1" });
    const stepIn   = Object.assign(document.createElement("input"), { type: "number", step: "1", min: "1" });
    const colorIn  = Object.assign(document.createElement("input"), { type: "color" });

    // Theme grid
    const themeRow = document.createElement("div"); themeRow.className = "sb2-modal-row";
    const themeLabel = document.createElement("label"); themeLabel.textContent = "Theme:";
    themeRow.appendChild(themeLabel);
    const grid = document.createElement("div"); grid.className = "sb2-theme-grid";
    const icons = THEMES.map(t => {
        const ic = document.createElement("div"); ic.className = "sb2-theme-icon"; ic.dataset.theme = t; ic.title = t;
        ic.style.background = `radial-gradient(circle at 30% 30%, ${THEME_DEFAULTS[t]?.color || "#888"}, #333)`;
        grid.appendChild(ic); return ic;
    });
    themeRow.appendChild(grid); modal.appendChild(themeRow);

    const shapeSelect = document.createElement("select");
    SHAPES.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s.replace(/_/g," "); shapeSelect.appendChild(o); });

    [row("Title:", titleIn), row("Min:", minIn), row("Max:", maxIn), row("Step:", stepIn), row("Color:", colorIn), row("Shape:", shapeSelect)].forEach(r => modal.appendChild(r));

    const btns = document.createElement("div"); btns.className = "sb2-modal-buttons";
    const saveBtn   = Object.assign(document.createElement("button"), { className: "sb2-modal-btn save", textContent: "Save" });
    const cancelBtn = Object.assign(document.createElement("button"), { className: "sb2-modal-btn",      textContent: "Cancel" });
    btns.appendChild(cancelBtn); btns.appendChild(saveBtn); modal.appendChild(btns);
    overlay.appendChild(modal);

    // Populate
    titleIn.value = props.title; minIn.value = props.min; maxIn.value = props.max;
    stepIn.value = props.stepper; colorIn.value = props.color;
    shapeSelect.value = shapeW?.value || "knob";

    let tempTheme = themeW?.value || "cyberpunk";
    const savedTheme = tempTheme;
    const markIcon = (t) => icons.forEach(i => i.classList.toggle("selected", i.dataset.theme === t));
    markIcon(tempTheme); applyTheme(tempTheme);

    icons.forEach(ic => {
        ic.addEventListener("click",       () => { tempTheme = ic.dataset.theme; applyTheme(tempTheme); markIcon(tempTheme); const d = THEME_DEFAULTS[tempTheme]; if (d) { colorIn.value = d.color; titleIn.value = d.title; } });
        ic.addEventListener("mouseenter",  () => applyTheme(ic.dataset.theme));
        ic.addEventListener("mouseleave",  () => applyTheme(tempTheme));
    });

    cancelBtn.addEventListener("click", () => { applyTheme(savedTheme); overlay.style.display = "none"; });

    // overlay is the same persistent DOM node across every buildModal() call
    // (only its children get cleared above), so the "click outside to close"
    // listener must be swapped out each time rather than added on top of the
    // previous one — otherwise every gear-icon click leaves another stale
    // listener (closing over that call's now-outdated savedTheme) behind.
    if (overlay._sb2OutsideClickHandler) {
        overlay.removeEventListener("click", overlay._sb2OutsideClickHandler);
    }
    const outsideClickHandler = (e) => { if (e.target === overlay) { applyTheme(savedTheme); overlay.style.display = "none"; } };
    overlay.addEventListener("click", outsideClickHandler);
    overlay._sb2OutsideClickHandler = outsideClickHandler;

    saveBtn.addEventListener("click", () => {
        let step = parseInt(stepIn.value, 10);
        let min  = parseInt(minIn.value, 10);
        let max  = parseInt(maxIn.value, 10);
        if (isNaN(min)) min = props.min;
        if (isNaN(max)) max = props.max;
        // A min >= max range makes (max - min) zero or negative everywhere
        // the dial computes a percentage (rotation, fill, slider position),
        // producing NaN or inverted visuals. Swap if reversed; if they're
        // equal, force a minimal valid range instead of silently breaking.
        if (min > max) { const t = min; min = max; max = t; }
        if (min === max) { max = min + 1; }
        minIn.value = min; maxIn.value = max;

        if (isNaN(step) || step < 1) step = 1;
        if (step > (max - min) && (max - min) > 0) step = max - min;
        props.title = titleIn.value; props.min = min; props.max = max; props.stepper = step; props.color = colorIn.value;
        if (shapeW) shapeW.value = shapeSelect.value;
        applyShape(shapeSelect.value); applyTheme(tempTheme);
        if (knobValueWidget) applyKnobValue(knobValueWidget.value);
        overlay.style.display = "none";
    });
}
