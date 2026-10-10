/** Colors as 0-255 red/green/blue. */
export interface LightColor { r: number; g: number; b: number }

export const OFF: LightColor = { r: 0, g: 0, b: 0 };
export const RED: LightColor = { r: 255, g: 0, b: 0 };
export const GREEN: LightColor = { r: 0, g: 255, b: 0 };
export const BLUE: LightColor = { r: 0, g: 0, b: 255 };
export const WHITE: LightColor = { r: 255, g: 255, b: 255 };

export const isOff = (c: LightColor) => !c.r && !c.g && !c.b;

/** White at a percentage, for stage lights during a set. */
export const whiteAt = (percent: number): LightColor => {
  const v = Math.round((Math.min(100, Math.max(0, percent)) / 100) * 255);
  return { r: v, g: v, b: v };
};

export const cssColor = (c: LightColor) => `rgb(${c.r}, ${c.g}, ${c.b})`;
