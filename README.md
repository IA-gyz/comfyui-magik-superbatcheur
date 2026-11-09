# SuperBatcheur 2.0

A ComfyUI custom node that advances a persisted index every time it runs, and can optionally load an image and/or a text file matching that index from two folders in lock-step. The index is driven by a fully custom, themeable knob/slider widget instead of a plain number box.

Use it to step through a folder of reference poses, a sequence of ControlNet frames, a batch of prompt `.txt` files, or anything else that's organized as `001, 002, 003, ...` and needs to advance one file per queue press — automatically, or under your control via the knob.

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Node reference](#node-reference)
- [How the counter works](#how-the-counter-works)
- [Loading images and text by index](#loading-images-and-text-by-index)
- [The knob widget](#the-knob-widget)
- [Settings modal](#settings-modal)
- [Themes](#themes)
- [Troubleshooting](#troubleshooting)
- [Technical notes](#technical-notes)
- [File structure](#file-structure)

---

## Features

- **Persistent index counter** — survives across queue runs without needing an external "increment" node; the count lives in a small state file on disk, not in the workflow JSON.
- **Custom knob widget** — a drawn (not native) widget with three interchangeable shapes: a rotary **knob**, a **vertical slider**, or a **horizontal slider**.
- **15 built-in visual themes** plus full manual control of title, color, range, and step size.
- **Freeze mode** — pause the counter at its current value without disconnecting anything.
- **Set Next** — jump the counter to an arbitrary value via the knob, instead of only ever advancing by 1.
- **Optional file loading** — point two folder-path inputs at an images folder and/or a text folder; the node returns the file at the current index from each, sorted in natural (numeric-aware) order.
- **"Fancy Note" display** — a large, glowing, resizable readout of the current padded index, with its own color picker and size slider.
- **Collision-safe persistence** — each node instance gets a stable identity that survives saving/reloading a workflow and surviving across *different* workflow files, so two unrelated graphs never stomp on each other's counters.

---

## Installation

1. Drop this node's folder into `ComfyUI/custom_nodes/`.
2. Restart ComfyUI (or use the Manager's "reload" if you have one installed).
3. The node appears in the node search as **SuperBatcheur 2.0**, in the `custom` category.

No extra Python packages beyond what ComfyUI already ships with (`torch`, `numpy`, `Pillow`) are required.

---

## Quick start

1. Add the node. Leave everything at its defaults.
2. (Optional) Wire a `STRING` output containing a folder path into **pix_path** and/or **txt_path**.
3. Queue the prompt. The **index** output starts at `1` and the node tries to load the 1st file (alphabetically/numerically) from each folder.
4. Queue again — the index advances to `2`, then `3`, and so on, automatically, with no extra nodes needed.
5. To jump to a specific value instead of advancing by 1, turn the knob to the value you want and click **Set Next**.
6. To pause on the current value indefinitely, click **Freeze**.

---

## Node reference

### Inputs

| Name | Type | Default | Notes |
|---|---|---|---|
| `knobValue` | INT | `1` (min `1`, max `999999`) | Backing value for the knob widget. Not used directly by the node logic — it only feeds the **Set Next** button. Hidden from the standard widget list; you interact with it through the knob graphic. |
| `freeze` | BOOLEAN | `False` | When on, the counter stops advancing and re-emits the same index every run. |
| `padding` | INT | `3` (min `1`, max `12`) | Zero-padding width for the `padded_index` output and the Fancy Note display. |
| `current_index` | INT | `1` | The counter's starting value the *first* time this node instance ever runs, and the value it jumps to after **Set Next**. Otherwise it's driven by the node's persisted state and you generally don't need to touch it directly. |
| `reset_trigger` | INT | `0` | Internal bookkeeping value, bumped automatically by **Set Next**. You shouldn't need to set this by hand. |
| `node_uuid` | STRING | `""` | Stable per-node identity, generated and managed automatically by the frontend. See [Technical notes](#technical-notes). |
| `pix_path` *(optional)* | STRING | `""` | Folder to pull images from. Must come in via a wire (force-input) — there's no inline text box. |
| `txt_path` *(optional)* | STRING | `""` | Folder to pull `.txt` prompt files from. Also force-input only. |

### Outputs

| Name | Type | Description |
|---|---|---|
| `index` | INT | The raw current counter value for this run (1-based). |
| `pix_path` | STRING | Passthrough of the `pix_path` input, for convenience chaining. |
| `padded_index` | STRING | `index` zero-padded to `padding` digits, e.g. `"007"`. |
| `pix_filename` | STRING | Filename (with extension) of the loaded image, or `""` if none. |
| `prompt_filename` | STRING | Filename of the loaded text file, or `""` if none. |
| `image` | IMAGE | The loaded image, or a blank 512×512 black image if nothing was loaded/found. |
| `prompt` | STRING | The loaded text file's contents, or `""`. |
| `pix_filename_no_ext` | STRING | Image filename without its extension. |
| `prompt_filename_no_ext` | STRING | Text filename without its extension. |
| `mask` | MASK | The image's alpha channel, or a blank mask if nothing was loaded. |

---

## How the counter works

Each run, the node does one of two things:

- **First run for this node, or just after Set Next** — outputs whatever `current_index` is set to, then internally prepares `current_index + 1` (or the same value, if frozen) as the value for next time.
- **Every run after that** — ignores the `current_index` widget value entirely and instead reads its *own* persisted value from disk, outputs that, and advances it by 1 (or holds it, if frozen).

This is what lets the counter survive across queue presses without you having to manually bump a number each time — the frontend mirrors the persisted "next" value back into the `current_index` widget after every run purely for display, but the source of truth lives in the state file, not the workflow JSON.

### Set Next

Turn the knob (drag, scroll-wheel, the ± corner buttons, or arrow keys while it's focused) to the value you want, then click **Set Next**. This does two things: it writes that value into `current_index`, and it bumps `reset_trigger` so the node knows to treat the *next* run as a fresh start rather than continuing its internal sequence. The "NEXT" readout in the panel updates immediately to show what the upcoming run will output.

### Freeze

Clicking **Freeze** stops the counter from advancing — every subsequent run re-emits the same index (and reloads the same files, if any) until you un-freeze it. Useful for holding on one frame while you iterate on everything else downstream.

---

## Loading images and text by index

If `pix_path` and/or `txt_path` are connected, the node lists every file in that folder matching a known extension, sorts them, and picks the one at the current index:

- **Images**: `.png .jpg .jpeg .bmp .webp .tiff`
- **Text**: `.txt`

Sorting is **natural** (numeric-aware), not plain alphabetical — `img2.png` sorts before `img10.png`, the way you'd expect, rather than a strict character-by-character comparison putting `img10` ahead of `img2`.

If the index is out of range for a given folder, that folder's outputs are blank (a black placeholder image/empty mask for images, an empty string for text) and a warning is printed to the ComfyUI console — it won't stop the workflow.

The two folders are read independently, so they don't need the same number of files, but for a typical "frame N + prompt N" pairing you'll usually want them to line up 1:1.

---

## The knob widget

The widget can take one of three shapes, switchable in the settings modal:

- **Knob** — click-drag vertically to change the value (relative drag, not absolute position), or use the scroll wheel.
- **Vertical slider** — drag the thumb, or click anywhere on the track to jump straight to that position. Top of the track is the maximum value.
- **Horizontal slider** — same as above, but left-to-right; left is the minimum.

All three shapes share the same value, range, and step — switching shapes is purely cosmetic.

Other ways to change the value:
- **± corner buttons** — step by the configured step size.
- **Arrow keys** — focus the widget (click it once) and use ↑/→ to increase, ↓/← to decrease.

Click the **⚙ gear icon** in the widget's header to open the settings modal.

---

## Settings modal

| Field | Effect |
|---|---|
| **Title** | Label shown above the knob. |
| **Min / Max** | The value range. New nodes default to `1–200`. If you enter a reversed or equal min/max, it's automatically corrected (swapped, or max bumped by 1) rather than silently breaking the dial. |
| **Step** | Increment used by drag-snapping, the ± buttons, and arrow keys. |
| **Color** | Accent color for the currently selected theme on this node (glow, indicator, fill). |
| **Theme** | Pick from 15 built-in visual themes (hover an icon to preview it live before committing). |
| **Shape** | Knob / vertical slider / horizontal slider. |

Click outside the modal, or **Cancel**, to discard changes and revert to whatever theme was active before you opened it. **Save** commits everything.

---

## Themes

`cyberpunk` · `steampunk` · `minimal` · `glass` · `retro` · `futuristic` · `gaming` · `dark` · `nature` · `cartoon` · `vaporwave` · `brutalist` · `material` · `neumorphism` · `skeuomorphic`

Each theme sets a default accent color and label when first selected, both still editable afterward — "Gaming" mode also adds an animated RGB color cycle to the knob/sliders.

---

## Troubleshooting

**The counter jumped to a value I didn't expect.**
Check whether `reset_trigger` got bumped (e.g. you clicked **Set Next** at some point) — that forces the next run to start from `current_index` rather than continuing the internal sequence.

**Images/text aren't loading even though the path looks right.**
- Confirm the path is coming in over a wire — `pix_path`/`txt_path` are force-input only and can't be typed in directly on the node.
- Check the ComfyUI console for an "out of range" or "no images found" warning.
- Confirm the file extensions are among the supported set listed above.

**The counter reset to 1 after I copy-pasted the node.**
That's expected and intentional — a pasted/duplicated node gets a fresh identity so its counter doesn't collide with the original's. If you actually want a true linked duplicate, that's not currently supported; treat copies as independent counters.

**I have two browser tabs open to different workflows and a node's display updated when I didn't queue anything in that tab.**
This was a known issue in early builds (the live-display sync didn't distinguish between identically-numbered nodes in different workflows) and has since been fixed — update if you're on an older copy of this node.

**The state file got corrupted somehow.**
It's just JSON at `~/.comfyui_superbatcheur2_state.json`. Worst case, delete it; every node's counter resets to its `current_index` default on the next run, same as a brand-new node.

---

## Technical notes

For anyone modifying this node or just curious how it's wired up:

- **Persistence**: counters are stored in a single shared JSON file at `~/.comfyui_superbatcheur2_state.json`, keyed by each node's identity, with the whole read → compute-next-value → write cycle done under a single lock to stay correct if multiple executions overlap. Entries untouched for 30 days are pruned automatically so the file doesn't grow forever.
- **Node identity (`node_uuid`)**: ComfyUI's own per-node `unique_id` is only unique *within one graph* — two different saved workflows can easily both contain a node with id `5`. This node generates a real UUID client-side on creation, persists it in `node.properties.uuid`, and mirrors it into a hidden `node_uuid` input so the Python side can key its state by something collision-safe instead. Duplicating a node (copy/paste, or the LiteGraph "clone" path) deliberately mints a *fresh* UUID for the copy rather than inheriting the original's.
- **Change detection**: `IS_CHANGED` is overridden so the node re-evaluates every queue press even when none of its visible inputs changed, since the "next" value is itself an implicit, file-stored input.
- **Live UI sync**: execution results are broadcast over the websocket to every connected browser tab; the broadcast includes `node_uuid` so a tab only applies the update if it actually matches the node it's displaying it for, rather than just matching on the (potentially colliding) numeric id.
- **Natural sort**: file listings are sorted by splitting filenames into alternating text/number runs and comparing number runs numerically, so non-zero-padded sequences (`img2`, `img10`) sort correctly.

---

## File structure

```
.
├── __init__.py          # Node registration
├── superbatcheur2.py    # Python backend (counter logic, file loading)
└── js/
    └── superbatcheur2.js  # Frontend widget (knob/sliders, themes, settings modal, panel)
```
