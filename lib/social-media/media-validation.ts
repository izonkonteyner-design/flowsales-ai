export const MAX_SOCIAL_MEDIA_BYTES = 10 * 1024 * 1024;
export function detectSocialMediaType(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(4,8) === "ftyp") return "video/mp4";
  return null;
}
