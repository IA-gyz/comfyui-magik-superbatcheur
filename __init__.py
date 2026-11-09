# __init__.py
# SuperBatcheur 2.0 - Extended Batch Index Counter

import folder_paths
from .superbatcheur2 import SuperBatcheur2

NODE_CLASS_MAPPINGS = {
    "SuperBatcheur2": SuperBatcheur2,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SuperBatcheur2": "Super Batcheur 2",
}

# Serve the JavaScript assets from the 'js' subfolder
WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]