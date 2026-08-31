export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hex2(v: number) {
  return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
}

export function lerpColorHex(fromHex: string, toHex: string, t: number): string {
  const clampT = Math.max(0, Math.min(1, t));
  const fr = parseInt(fromHex.slice(1, 3), 16);
  const fg = parseInt(fromHex.slice(3, 5), 16);
  const fb = parseInt(fromHex.slice(5, 7), 16);
  const tr = parseInt(toHex.slice(1, 3), 16);
  const tg = parseInt(toHex.slice(3, 5), 16);
  const tb = parseInt(toHex.slice(5, 7), 16);
  return `#${hex2(fr + (tr - fr) * clampT)}${hex2(fg + (tg - fg) * clampT)}${hex2(fb + (tb - fb) * clampT)}`;
}
