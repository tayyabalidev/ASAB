/**
 * Shared CSS filter strings for WebView photo/video previews (create, home, profile).
 */

/** @param {Record<string, unknown> | null | undefined} data @param {string} key @param {number} fallback */
function adjNum(data, key, fallback = 0) {
  if (!data) return fallback;
  const v = data[key];
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {string | null | undefined} filterId
 * @param {Record<string, number> | null | undefined} adjustmentsData
 * @returns {string}
 */
export function getFilterCSS(filterId, adjustmentsData = null) {
  let filterCSS = '';

  switch (filterId) {
    case 'wavy':
      filterCSS += 'brightness(1.05) contrast(0.95) saturate(0.85) hue-rotate(5deg)';
      break;
    case 'paris':
      filterCSS += 'brightness(1.08) contrast(1.1) saturate(1.15) hue-rotate(-10deg)';
      break;
    case 'losangeles':
      filterCSS += 'brightness(1.15) contrast(1.05) saturate(1.2) hue-rotate(15deg)';
      break;
    case 'oslo':
      filterCSS += 'brightness(0.95) contrast(1.1) saturate(0.9) hue-rotate(10deg)';
      break;
    case 'tokyo':
      filterCSS += 'brightness(1.1) contrast(1.15) saturate(1.1) hue-rotate(-5deg)';
      break;
    case 'london':
      filterCSS += 'brightness(0.9) contrast(1.2) saturate(0.95) hue-rotate(5deg)';
      break;
    case 'moscow':
      filterCSS += 'brightness(0.92) contrast(1.25) saturate(0.88) hue-rotate(-8deg)';
      break;
    case 'berlin':
      filterCSS += 'brightness(0.98) contrast(1.15) saturate(1.05) hue-rotate(12deg)';
      break;
    case 'rome':
      filterCSS += 'brightness(1.12) contrast(1.08) saturate(1.18) hue-rotate(-12deg)';
      break;
    case 'madrid':
      filterCSS += 'brightness(1.05) contrast(1.2) saturate(1.12) hue-rotate(8deg)';
      break;
    case 'amsterdam':
      filterCSS += 'brightness(1.08) contrast(1.05) saturate(1.1) hue-rotate(-15deg)';
      break;
    case 'vintage':
      filterCSS += 'brightness(1.1) contrast(0.9) saturate(0.8) sepia(0.2)';
      break;
    case 'blackwhite':
      filterCSS += 'grayscale(100%)';
      break;
    case 'sepia':
      filterCSS += 'sepia(1) brightness(1.1) contrast(0.9)';
      break;
    case 'cool':
      filterCSS += 'hue-rotate(30deg) saturate(0.9)';
      break;
    case 'warm':
      filterCSS += 'hue-rotate(-30deg) saturate(1.1)';
      break;
    case 'contrast':
      filterCSS += 'contrast(1.3)';
      break;
    case 'bright':
      filterCSS += 'brightness(1.2) contrast(1.1)';
      break;
    case 'dramatic':
      filterCSS += 'contrast(1.4) saturate(1.2) brightness(0.95)';
      break;
    case 'portrait':
      filterCSS += 'contrast(1.1) saturate(1.05) brightness(1.05)';
      break;
    case 'cinema':
      filterCSS += 'contrast(1.2) saturate(0.85) brightness(0.9)';
      break;
    case 'noir':
      filterCSS += 'grayscale(100%) contrast(1.3) brightness(0.9)';
      break;
    case 'vivid':
      filterCSS += 'saturate(1.3) contrast(1.2) brightness(1.05)';
      break;
    case 'fade':
      filterCSS += 'brightness(1.1) contrast(0.85) saturate(0.7)';
      break;
    case 'chrome':
      filterCSS += 'contrast(1.2) saturate(1.1) brightness(1.05)';
      break;
    case 'process':
      filterCSS += 'contrast(1.15) saturate(1.1) brightness(1.02)';
      break;
    default:
      break;
  }

  if (adjustmentsData) {
    const parts = [];
    const brightness = adjNum(adjustmentsData, 'brightness');
    const contrast = adjNum(adjustmentsData, 'contrast', 1);
    const saturation = adjNum(adjustmentsData, 'saturation', 1);
    const hue = adjNum(adjustmentsData, 'hue');
    if (brightness !== 0) {
      parts.push(`brightness(${1 + brightness / 100})`);
    }
    if (contrast !== 1) {
      parts.push(`contrast(${contrast})`);
    }
    if (saturation !== 1) {
      parts.push(`saturate(${saturation})`);
    }
    if (hue !== 0) {
      parts.push(`hue-rotate(${hue}deg)`);
    }
    if (parts.length > 0) {
      filterCSS = filterCSS ? `${filterCSS} ${parts.join(' ')}` : parts.join(' ');
    }
  }

  return filterCSS || 'none';
}

/**
 * Video editor / feed playback filter CSS (lux, structure, warmth, fade, etc.).
 * @param {string | null | undefined} filterId
 * @param {Record<string, number> | null | undefined} adjustmentsData
 * @returns {string}
 */
export function getVideoFilterCSS(filterId, adjustmentsData = null) {
  const baseFilterCSS = getFilterCSS(filterId, null);
  const adjustmentParts = [];

  if (adjustmentsData) {
    const brightness = adjNum(adjustmentsData, 'brightness');
    const lux = adjNum(adjustmentsData, 'lux');
    const highlights = adjNum(adjustmentsData, 'highlights');
    const shadows = adjNum(adjustmentsData, 'shadows');
    const contrast = adjNum(adjustmentsData, 'contrast');
    const structure = adjNum(adjustmentsData, 'structure');
    const saturation = adjNum(adjustmentsData, 'saturation');
    const warmth = adjNum(adjustmentsData, 'warmth');
    const fade = adjNum(adjustmentsData, 'fade');

    let brightnessValue = 1;
    if (brightness !== 0) {
      brightnessValue *= 1 + brightness / 200;
    }
    if (lux !== 0) {
      brightnessValue *= 1 + lux / 300;
    }
    if (highlights !== 0) {
      brightnessValue *= 1 + highlights / 300;
    }
    if (shadows !== 0) {
      brightnessValue *= 1 - shadows / 400;
    }
    if (brightnessValue !== 1) {
      adjustmentParts.push(`brightness(${brightnessValue.toFixed(2)})`);
    }

    let contrastValue = 1.0;
    if (contrast !== 0) {
      contrastValue = 0.5 + ((contrast + 100) / 200) * 1.0;
    }
    if (structure !== 0) {
      const structureValue = 0.5 + ((structure + 100) / 200) * 1.0;
      contrastValue *= structureValue;
    }
    if (contrastValue !== 1.0) {
      adjustmentParts.push(`contrast(${contrastValue.toFixed(2)})`);
    }

    if (saturation !== 0) {
      adjustmentParts.push(`saturate(${(1 + saturation / 100).toFixed(2)})`);
    }

    if (warmth !== 0) {
      adjustmentParts.push(`hue-rotate(${((warmth / 100) * 30).toFixed(1)}deg)`);
    }

    if (fade !== 0) {
      adjustmentParts.push(`opacity(${(1 - (fade / 100) * 0.3).toFixed(2)})`);
      adjustmentParts.push(`saturate(${(1 - (fade / 100) * 0.3).toFixed(2)})`);
    }
  }

  const allParts = [];
  if (baseFilterCSS && baseFilterCSS !== 'none') {
    allParts.push(baseFilterCSS);
  }
  if (adjustmentParts.length > 0) {
    allParts.push(adjustmentParts.join(' '));
  }

  return allParts.length > 0 ? allParts.join(' ') : 'none';
}
