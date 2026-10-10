# Manual annotation and historical draft provenance

Normal workflow: open mask_editor.html, load an original photo + draft mask,
correct, download, and save the reviewed PNG under data/local_17/masks/reviewed/.
This browser editor needs no Python environment and does not autosave your work.

The `source/` scripts explain/reproduce the earlier **annotation draft** workflow:
ExtraTrees colour/texture classification, image-specific sky patches and GrabCut.
They are NOT the trained DeepLabV3 model, and do not create ground truth automatically.
They are optional and are not called by the API, notebook or frontend.

To regenerate drafts separately (from the kithmini root):

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-annotation.txt
.\.venv\Scripts\python.exe tools/mask_annotation/source/make_drafts.py --cnn "C:/datasets/CNN.zip" --originals data/local_17/originals --out results/draft_regeneration
.\.venv\Scripts\python.exe tools/mask_annotation/source/refine.py --workspace results/draft_regeneration
.\.venv\Scripts\python.exe tools/mask_annotation/source/graph_refine.py --workspace results/draft_regeneration
```

The first script requires an empty output directory to preserve existing masks.
The refinement scripts modify ONLY that explicitly selected generation workspace.
Historical patches require exactly the original 17 filenames and 2000×2000 images.
GrabCut uses the same export dimensions. Never point this workflow at reviewed masks.
Uncertainty values in its manifest originate from the initial classifier and are
not calibrated accuracy or updated confidence after refinement.

Version differences can change draft boundaries. Existing draft image bytes were
preserved in this review; regeneration is not required to use the editor or API.
