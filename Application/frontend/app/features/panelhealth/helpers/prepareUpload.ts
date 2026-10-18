/**
 * prepareUpload.ts - turn the chosen file into the JPEG that is shown, tapped on and uploaded.
 *
 * Drawing the photo onto a canvas applies the phone's rotation (EXIF) in modern browsers,
 * so the photo the user taps on is exactly the photo the server receives, and the corner
 * fractions mean the same thing on both sides. It also shrinks big phone photos so the
 * upload stays small (the panel only needs to be a couple of thousand pixels tall).
 */
export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  url: string // object URL for showing it; revoke with URL.revokeObjectURL when done
}

export async function prepareUpload(file: File, maxSide = 2576, quality = 0.9): Promise<PreparedImage> {
  const srcUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = srcUrl
    await img.decode() // fails for formats the browser cannot read (e.g. HEIC outside Safari)
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const width = Math.round(img.naturalWidth * scale)
    const height = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("This browser cannot process images.")
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare the photo."))), "image/jpeg", quality),
    )
    return { blob, width, height, url: URL.createObjectURL(blob) }
  } finally {
    URL.revokeObjectURL(srcUrl)
  }
}
