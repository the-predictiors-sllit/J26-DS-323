# Local images and labels

originals/: unchanged source photos.
masks/drafts/: existing unreviewed ExtraTrees + manual patches + GrabCut drafts.
masks/reviewed/: human-corrected annotations, saved separately.
metadata/: original draft manifest plus actual GPS/camera/heading/review records.

PNG convention: black 0 = sky (clouds included); white 255 = visible non-sky.
People/watermarks need a separate unknown region or a new photo for solar geometry.
Do not invent GPS, headings, reviewed status or calibration.
Use matching base photo IDs. Record reviewer, date and revision for reviewed masks.
DeepLabV3 predictions belong in results/local_predictions/, not this reference folder.
These local assets are not ignored by the component .gitignore.
