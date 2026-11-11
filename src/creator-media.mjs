/**
 * Uploaded, locally-licensed scene media for controlled Forge render tests.
 * Never fetches external URLs, imports active SVG/HTML, or evaluates user data.
 * Image/video files are treated as untrusted and are decoded by the renderer.
 */
const TYPES = {
  jpg: { mime: ["image/jpeg"], kind: "image" },
  jpeg: { mime: ["image/jpeg"], kind: "image" },
  png: { mime: ["image/png"], kind: "image" },
  webp: { mime: ["image/webp"], kind: "image" },
  mp4: { mime: ["video/mp4"], kind: "video" },
  webm: { mime: ["video/webm"], kind: "video" }
};
export const MAX_SCENE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_MEDIA_TOTAL_BYTES = 18 * 1024 * 1024;

function validHeader(buffer, type) {
  switch (type) {
    case "jpg": case "jpeg":
      return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "png": return buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    case "webp": return buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP";
    case "mp4": return buffer.subarray(4, 8).toString("ascii") === "ftyp";
    case "webm": return buffer.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex"));
    default: return false;
  }
}

export function validateSceneMedia(input) {
  if (input == null) return Array(5).fill(null);
  if (!Array.isArray(input) || input.length !== 5) {
    throw new TypeError("Envie uma lista de 5 posições para mídia das cenas");
  }
  return input.map((asset, index) => {
    if (asset == null) return null;
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      throw new TypeError("Mídia inválida na cena " + (index + 1));
    }
    const filename = String(asset.filename || "").split(/[\\/]/).pop().slice(0, 140);
    const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    if (!extension || !Object.hasOwn(TYPES, extension)) {
      throw new TypeError("Cena " + (index + 1) + ": use JPEG, PNG, WEBP, MP4 ou WEBM");
    }
    const type = TYPES[extension];
    const mime = String(asset.mimeType || "").toLowerCase().split(";")[0];
    if (mime && mime !== "application/octet-stream" && !type.mime.includes(mime)) {
      throw new TypeError("Cena " + (index + 1) + ": tipo do arquivo não corresponde à extensão");
    }
    const encoded = asset.contentBase64;
    if (typeof encoded !== "string" || !encoded.length || encoded.length > Math.ceil(MAX_SCENE_FILE_BYTES / 3) * 4 + 4 ||
        encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
      throw new TypeError("Cena " + (index + 1) + ": dados da mídia inválidos ou arquivo grande demais");
    }
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.length || bytes.length > MAX_SCENE_FILE_BYTES || bytes.toString("base64") !== encoded ||
      !validHeader(bytes, extension) || (asset.sizeBytes !== undefined && Number(asset.sizeBytes) !== bytes.length)) {
      throw new TypeError("Cena " + (index + 1) + ": mídia inválida ou acima de 5 MB");
    }
    if (type.kind === "video") {
      const durationSeconds = Number(asset.durationSeconds);
      if (!Number.isFinite(durationSeconds) || durationSeconds < 0.5 || durationSeconds > 1200) {
        throw new TypeError("Cena " + (index + 1) + ": duração inválida do vídeo");
      }
    }
    return {
      filename,
      kind: type.kind,
      mimeType: type.mime[0],
      sizeBytes: bytes.length,
      durationSeconds: type.kind === "video" ? Number(asset.durationSeconds) : null,
      path: "assets/scenes/scene-" + String(index + 1).padStart(2, "0") + "." + extension,
      contentBase64: encoded
    };
  });
}

export function sceneMediaReadiness(sceneMedia, audio, durationSeconds, scenes, sfxAssets = []) {
  const blockers = [], warnings = [];
  const supplied = sceneMedia.filter(Boolean);
  if (supplied.length !== 5) blockers.push("Associe uma imagem ou vídeo real a cada uma das cinco cenas (" + supplied.length + "/5).");
  if (!audio.voiceover) blockers.push("Anexe uma locução para o teste narrado.");
  else if (Math.abs(audio.voiceover.durationSeconds - durationSeconds) > 1.5) {
    blockers.push("A duração da locução precisa estar a até 1,5 s da composição.");
  }
  if (!audio.music) warnings.push("Sem trilha musical: revisar a intenção de silêncio.");
  else if (audio.music.durationSeconds < durationSeconds - 0.5) {
    blockers.push("A trilha termina antes do vídeo.");
  }
  const total = supplied.reduce((sum, item) => sum + item.sizeBytes, 0) +
      (audio.voiceover?.sizeBytes || 0) + (audio.music?.sizeBytes || 0) + sfxAssets.reduce((sum, item) => sum + (item?.sizeBytes || 0), 0);
  if (total > MAX_MEDIA_TOTAL_BYTES) blockers.push("Áudio + mídia excedem 18 MB por requisição.");
  scenes.forEach((scene, index) => { if (scene.sound && !sfxAssets[index]) warnings.push("Cena " + (index + 1) + ": efeito sonoro descrito, mas sem arquivo anexado."); });
  supplied.forEach((item, index) => {
    if (item.kind !== "video") return;
    const sceneSeconds = scenes[index].end - scenes[index].start;
    if (item.durationSeconds + 0.1 < sceneSeconds) blockers.push("O vídeo da cena " + (index + 1) + " é mais curto que a cena.");
  });
  return { eligible: blockers.length === 0, blockers, warnings, totalMediaBytes: total };
}
