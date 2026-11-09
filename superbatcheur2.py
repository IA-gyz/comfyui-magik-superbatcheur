"""
SuperBatcheur 2.0 - Extended Batch Index Counter with Knob INT, Image and Text Loading
"""

import server
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Dict, Any, Tuple
import torch
import numpy as np
from PIL import Image


class SuperBatcheur2:
    """
    Sequential index counter with an integrated Knob INT selector at the top,
    plus optional image/text loading from folders.
    """

    DESCRIPTION = (
        "Advances a persisted index each run and can load image/prompt files by index. "
        "The Knob INT widget at the top drives the Set Next value directly — "
        "no separate target input is needed."
    )

    STATE_FILE = Path(os.path.expanduser("~/.comfyui_superbatcheur2_state.json"))
    _lock = threading.Lock()
    # Entries for nodes not seen in this long get pruned from the shared state
    # file so it doesn't grow forever as nodes get deleted/recreated.
    STALE_AFTER_SECONDS = 30 * 24 * 60 * 60  # 30 days

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # ── Knob INT (first / top) ──────────────────────────────────
                "knobValue": (
                    "INT",
                    {
                        "default": 1,
                        "min": 1,
                        "max": 999999,
                        "step": 1,
                        "widget": "magik_knob_int",
                    },
                ),
                # ── Batcheur controls ───────────────────────────────────────
                "freeze": ("BOOLEAN", {"default": False}),
                "padding": ("INT", {"default": 3, "min": 1, "max": 12}),
                # NOTE: default must stay 1, not 0 — file_index = output_value - 1
                # assumes a 1-based counter (matching knobValue's own default/min
                # of 1). Starting at 0 makes the first two executions both resolve
                # to file_index 0, loading the first file in the folder twice.
                "current_index": ("INT", {"default": 1}),
                "reset_trigger": ("INT", {"default": 0}),
                # Stable per-node identity generated client-side and persisted
                # in node.properties (see superbatcheur2.js). unique_id (below)
                # is only unique *within a single graph* — two different saved
                # workflows can easily both contain a node with id "5", which
                # would otherwise let them clobber each other's counter in the
                # shared state file. node_uuid avoids that collision; falls
                # back to unique_id if a workflow predates this field.
                "node_uuid": ("STRING", {"default": ""}),
            },
            "optional": {
                "pix_path": ("STRING", {"forceInput": True, "default": ""}),
                "txt_path": ("STRING", {"forceInput": True, "default": ""}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = (
        "INT",       # batch index
        "STRING",    # pix_path passthrough
        "STRING",    # padded index
        "STRING",    # pix filename
        "STRING",    # prompt filename
        "IMAGE",     # loaded image
        "STRING",    # loaded prompt text
        "STRING",    # pix filename without extension
        "STRING",    # prompt filename without extension
        "MASK",      # alpha channel as mask
    )
    RETURN_NAMES = (
        "index",
        "pix_path",
        "padded_index",
        "pix_filename",
        "prompt_filename",
        "image",
        "prompt",
        "pix_filename_no_ext",
        "prompt_filename_no_ext",
        "mask",
    )
    FUNCTION = "process"
    CATEGORY = "custom"

    # ── State helpers ────────────────────────────────────────────────────────
    # _read_state_file_raw / _write_state_file_raw do NOT acquire cls._lock —
    # callers must hold it. This lets _advance_index() perform the whole
    # read -> compute -> write cycle under a single lock acquisition instead
    # of two separate ones, which previously left a window where two
    # concurrent executions could both read the same index and both write
    # back the same "next" value (skipping/repeating an index).

    @classmethod
    def _read_state_file_raw(cls) -> Dict[str, Any]:
        try:
            if cls.STATE_FILE.exists():
                with open(cls.STATE_FILE, "r") as f:
                    return json.load(f)
            return {}
        except Exception as e:
            print(f"[SuperBatcheur2] Error reading state: {e}")
            return {}

    @classmethod
    def _write_state_file_raw(cls, state: Dict[str, Any]) -> None:
        try:
            cls.STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            temp_file = cls.STATE_FILE.with_suffix(".tmp")
            with open(temp_file, "w") as f:
                json.dump(state, f, indent=2)
            temp_file.replace(cls.STATE_FILE)
        except Exception as e:
            print(f"[SuperBatcheur2] Error writing state: {e}")

    @classmethod
    def _read_state_dict(cls) -> Dict[str, Any]:
        """Read-only snapshot for IS_CHANGED's change-detection check."""
        with cls._lock:
            return cls._read_state_file_raw()

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        state = cls._read_state_dict()
        uid = kwargs.get("node_uuid") or kwargs.get("unique_id") or ""
        node_state = state.get(uid) or {}
        return (
            node_state.get("index"),
            node_state.get("last_reset"),
            kwargs.get("reset_trigger", 0),
            kwargs.get("freeze", False),
            kwargs.get("padding", 3),
            kwargs.get("pix_path") or "",
            kwargs.get("txt_path") or "",
            kwargs.get("current_index", 1),
            kwargs.get("knobValue", 1),
        )

    @classmethod
    def _prune_stale_entries(cls, state: Dict[str, Any]) -> None:
        now = time.time()
        stale_keys = [
            k for k, v in state.items()
            if isinstance(v, dict)
            and isinstance(v.get("last_seen"), (int, float))
            and (now - v["last_seen"]) > cls.STALE_AFTER_SECONDS
        ]
        for k in stale_keys:
            del state[k]

    def _advance_index(
        self, state_key: str, current_index: int, reset_trigger: int, freeze: bool
    ) -> Tuple[int, int]:
        """Atomically read, compute, and persist the next index for this node.

        `state_key` should be a value stable across saves/reloads of a single
        node (see node_uuid in INPUT_TYPES) — NOT the LiteGraph unique_id,
        which is only unique within one graph and can collide across
        different saved workflows.

        Returns (output_value, next_value).
        """
        with self._lock:
            state = self._read_state_file_raw()
            node_state = state.get(state_key)

            if node_state is None or reset_trigger != node_state.get("last_reset", 0):
                output_value = current_index
                next_value = current_index if freeze else current_index + 1
                node_state = {"index": next_value, "last_reset": reset_trigger}
            else:
                last_saved = node_state.get("index", current_index)
                output_value = last_saved
                next_value = last_saved if freeze else last_saved + 1
                node_state["index"] = next_value

            node_state["last_seen"] = time.time()
            state[state_key] = node_state
            self._prune_stale_entries(state)
            self._write_state_file_raw(state)

            return output_value, next_value

    # ── File helpers ─────────────────────────────────────────────────────────

    def _load_image(self, image_path: str) -> Tuple[torch.Tensor, torch.Tensor]:
        try:
            img = Image.open(image_path).convert("RGBA")
            img_np = np.array(img).astype(np.float32) / 255.0
            rgb = img_np[:, :, :3]
            alpha = img_np[:, :, 3]
            image = torch.from_numpy(rgb)[None,]
            mask = torch.from_numpy(alpha)[None,]
            return image, mask
        except Exception as e:
            print(f"[SuperBatcheur2] Error loading image {image_path}: {e}")
            return (
                torch.zeros((1, 512, 512, 3), dtype=torch.float32),
                torch.zeros((1, 512, 512), dtype=torch.float32),
            )

    def _load_text(self, text_path: str) -> str:
        try:
            with open(text_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            print(f"[SuperBatcheur2] Error loading text {text_path}: {e}")
            return ""

    @staticmethod
    def _natural_sort_key(name: str):
        # Splits "img10.png" into ["img", 10, ".png"] so numeric runs compare
        # numerically instead of lexically — plain string sort would put
        # "img10" before "img2" since "1" < "2" character-by-character.
        return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", name)]

    def _get_sorted_files(self, directory: str, extensions: list) -> list:
        if not directory or not str(directory).strip():
            return []
        ext_set = {e.lower() for e in extensions}
        try:
            path = Path(directory)
            if not path.exists() or not path.is_dir():
                return []
            files = [p for p in path.iterdir() if p.is_file() and p.suffix.lower() in ext_set]
            return sorted(files, key=lambda x: self._natural_sort_key(x.name))
        except Exception as e:
            print(f"[SuperBatcheur2] Error reading directory {directory}: {e}")
            return []

    # ── Main execution ───────────────────────────────────────────────────────

    def process(
        self,
        knobValue: int = 1,
        pix_path: str = "",
        txt_path: str = "",
        freeze: bool = False,
        padding: int = 3,
        current_index: int = 1,
        reset_trigger: int = 0,
        unique_id: str = "",
        node_uuid: str = "",
    ) -> Tuple[int, str, str, str, str, torch.Tensor, str, str, str, torch.Tensor]:

        if padding is None or padding < 1 or padding > 12:
            padding = 3

        # Guard against an upstream node outputting None instead of "" —
        # .strip() below would otherwise raise AttributeError.
        pix_path = pix_path or ""
        txt_path = txt_path or ""

        # node_uuid is stable across saves/reloads of this node; unique_id is
        # only unique within the current graph. Prefer node_uuid, but fall
        # back gracefully for workflows saved before this field existed.
        state_key = node_uuid or unique_id
        output_value, new_next = self._advance_index(state_key, current_index, reset_trigger, freeze)

        padded_out = str(output_value).zfill(padding)
        file_index = max(0, output_value - 1)

        # Image files
        image_extensions = [".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tiff"]
        image_files = self._get_sorted_files(pix_path.strip(), image_extensions) if pix_path.strip() else []
        pix_filename = ""
        pix_filename_no_ext = ""
        image_tensor = torch.zeros((1, 512, 512, 3), dtype=torch.float32)
        mask_tensor = torch.zeros((1, 512, 512), dtype=torch.float32)

        if image_files and 0 <= file_index < len(image_files):
            pix_filename = image_files[file_index].name
            pix_filename_no_ext = image_files[file_index].stem
            image_tensor, mask_tensor = self._load_image(str(image_files[file_index]))
        elif image_files:
            print(f"[SuperBatcheur2] Index {file_index} out of range for images (0-{len(image_files)-1})")
        elif pix_path.strip():
            print(f"[SuperBatcheur2] No images found in {pix_path}")

        # Text files
        text_files = self._get_sorted_files(txt_path.strip(), [".txt"]) if txt_path.strip() else []
        prompt_filename = ""
        prompt_filename_no_ext = ""
        prompt_text = ""

        if text_files and 0 <= file_index < len(text_files):
            prompt_filename = text_files[file_index].name
            prompt_filename_no_ext = text_files[file_index].stem
            prompt_text = self._load_text(str(text_files[file_index]))
        elif text_files:
            print(f"[SuperBatcheur2] Index {file_index} out of range for texts (0-{len(text_files)-1})")
        elif txt_path.strip():
            print(f"[SuperBatcheur2] No text files found in {txt_path}")

        # Notify frontend
        try:
            if server.PromptServer.instance:
                server.PromptServer.instance.send_sync("superbatcheur2_executed", {
                    "node_id": unique_id,
                    # Raw node_uuid (may be "" for a workflow saved before this
                    # field existed) — lets the JS side confirm this broadcast
                    # is meant for THIS node before applying it, since send_sync
                    # reaches every connected browser tab and unique_id alone
                    # can collide across different open workflows.
                    "node_uuid": node_uuid,
                    "current": output_value,
                    "next": new_next,
                    "freeze": freeze,
                    "padded_index": padded_out,
                    "pix_filename": pix_filename,
                    "prompt_filename": prompt_filename,
                })
        except Exception as e:
            print(f"[SuperBatcheur2] Warning: {e}")

        return (
            output_value,
            pix_path,
            padded_out,
            pix_filename,
            prompt_filename,
            image_tensor,
            prompt_text,
            pix_filename_no_ext,
            prompt_filename_no_ext,
            mask_tensor,
        )