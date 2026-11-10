"""
merge_onnx_model.py
────────────────────────────────────────────────────────────────────────────────
Merges an ONNX model's external .data sidecar into a single self-contained file.

Run this ONCE on your local machine where both files exist:
    plant_disease.onnx
    plant_disease.onnx.data   ← this is the missing file causing the error

Usage:
    pip install onnx
    python merge_onnx_model.py

Output:
    models/plant_disease_merged.onnx   ← single file, no sidecar needed
────────────────────────────────────────────────────────────────────────────────
"""

import onnx
from onnx.external_data_helper import load_external_data_for_model
import os
import sys

# ── Paths ─────────────────────────────────────────────────────────────────────
# Adjust these if your files are in a different location.
ONNX_FILE   = "plant_disease.onnx"          # The .onnx file (with external refs)
OUTPUT_FILE = "plant_disease_merged.onnx"   # Output: single self-contained file

# The .data file must live in the SAME directory as the .onnx file.
MODEL_DIR = os.path.dirname(os.path.abspath(ONNX_FILE))

# ── Validate inputs ───────────────────────────────────────────────────────────
if not os.path.exists(ONNX_FILE):
    print(f"❌  Not found: {ONNX_FILE}")
    print("    Place this script next to your plant_disease.onnx file and retry.")
    sys.exit(1)

data_file = os.path.join(MODEL_DIR, "plant_disease.onnx.data")
if not os.path.exists(data_file):
    # Also try the renamed upload version
    data_file_alt = os.path.join(MODEL_DIR, "plant_disease__1_.onnx.data")
    if os.path.exists(data_file_alt):
        data_file = data_file_alt
    else:
        print(f"❌  External data file not found.")
        print(f"    Expected: {data_file}")
        print()
        print("    The .onnx.data file was generated alongside the .onnx file when")
        print("    the model was exported. You need BOTH files from wherever the")
        print("    model was originally trained/exported.")
        sys.exit(1)

print(f"✅  Found model : {ONNX_FILE}  ({os.path.getsize(ONNX_FILE):,} bytes)")
print(f"✅  Found data  : {data_file}  ({os.path.getsize(data_file):,} bytes)")

# ── Load and inline all external weights ─────────────────────────────────────
print("\n⏳  Loading model and inlining external weights (this may take a moment)...")

model = onnx.load(ONNX_FILE, load_external_data=False)

# load_external_data_for_model reads the .data file and inlines every
# weight tensor directly into the model protobuf in memory.
load_external_data_for_model(model, MODEL_DIR)

# ── Save as a single file ────────────────────────────────────────────────────
print(f"💾  Saving merged model → {OUTPUT_FILE}")
onnx.save(model, OUTPUT_FILE)

size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
print(f"✅  Done! {OUTPUT_FILE}  ({size_mb:.1f} MB)")
print()
print("Next steps:")
print(f"  1. Copy '{OUTPUT_FILE}' into your project's  models/  folder")
print(f"  2. Rename it to  plant_disease.onnx  (replacing the old split version)")
print(f"  3. Delete the old  plant_disease.onnx.data  — it's no longer needed")
print(f"  4. Restart the server — the error will be gone")
