/** Night and sunset look of the city sky and light (all numbers in one place). Colours are hex, directions are world vectors. */
export const NIGHT = {
  // Readable moonlit blue (not navy-black): bright ambient so a child can see the street.
  skyTop: [0.07, 0.12, 0.30], skyHorizon: [0.30, 0.42, 0.68],
  fog: 0x3d5584,
  hemiSky: 0xa9c2f0, hemiGround: 0x6f86a8, hemiIntensity: 1.05,
  envIntensity: 0.28,
  moonColor: 0xf2f6ff, moonIntensity: 1.05,
  sunOffset: [-26, 38, -34] as const, // light direction and moon position (same vector)
  moonRadius: 0.045, // radians-ish in texture u/v units
  stars: 320, brightStars: 22, starSize: 1.6, starBrightSize: 9, starRadius: 160, // size in screen px (constant)
  lampColor: 0xffc878, lampIntensity: 2.2, lampDistance: 15, // warm pool that follows the player
};

export const SUNSET = {
  // Sun and warm band sit in the WEST (-x). East (+x) is purple-blue.
  sunOffset: [-58, 14, 6] as const,
  skyTop: [0.20, 0.27, 0.58], skyEast: [0.36, 0.30, 0.60],
  bandInner: [1.0, 0.62, 0.30], bandOuter: [0.96, 0.42, 0.50],
  bandWidth: 0.34, // fraction of the sky circle (u) the warm glow spreads over
  sunRadius: 0.032, sunColor: [1.0, 0.93, 0.70],
  fog: 0xd9906f,
  hemiSky: 0x9fa8d8, hemiGround: 0x7a5648, hemiIntensity: 0.85,
  envIntensity: 0.5,
  lightColor: 0xff9e55, lightIntensity: 2.1,
};
