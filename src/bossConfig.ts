export const SHADOW_ROOT_SCALE = 1.5;
export const BOSS_SCALE_FACTOR = 3;
export const BOSS_ROOT_SCALE = SHADOW_ROOT_SCALE * BOSS_SCALE_FACTOR;

// Shadow's original mesh is 1.97 units tall; the target point is its vertical midpoint at 3x scale.
export const BOSS_BODY_OFFSET = 1.97 * BOSS_ROOT_SCALE * 0.5;
export const BOSS_HIT_RADIUS = 2.8;
export const BOSS_HIT_HALF_HEIGHT = 4.55;
