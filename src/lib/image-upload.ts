const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];

function hasSupportedExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  return SUPPORTED_IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isHeicFile(file: File) {
  const lower = file.name.toLowerCase();
  return file.type === "image/heic" || file.type === "image/heif" || lower.endsWith(".heic") || lower.endsWith(".heif");
}

function replaceExtensionWithJpg(fileName: string) {
  return fileName.replace(/\.(heic|heif)$/i, ".jpg");
}

export async function prepareImageFileForUpload(file: File) {
  const hasSupportedType = SUPPORTED_IMAGE_MIME_TYPES.has(file.type);
  const hasExtension = hasSupportedExtension(file.name);

  if (!hasSupportedType && !hasExtension) {
    throw new Error(`Unsupported image format for ${file.name}. Please upload JPG, PNG, WEBP, or HEIC/HEIF.`);
  }

  if (!isHeicFile(file)) {
    return file;
  }

  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });

  const convertedBlob = Array.isArray(converted) ? converted[0] : converted;
  if (!(convertedBlob instanceof Blob)) {
    throw new Error(`Failed to convert ${file.name} from HEIC/HEIF.`);
  }

  return new File([convertedBlob], replaceExtensionWithJpg(file.name), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
