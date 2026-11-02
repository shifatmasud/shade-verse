/**
 * The MASKED ROLL odometer from Shifat's portfolio (surface-tension src/dom/ui/maskedRoll.ts, his "signature move"):
 * every digit column is a vertical reel (0-9 three times) inside an overflow mask; the value rolls continuously and a
 * column left of the units turns IN STEP with the digits to its right passing 8 -> 9 -> 0, so a carry slides, never swaps
 * (099 -> 100 rolls all three columns together). Positions are a pure function of the value.
 */
const CARRY = 2;
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function rollPositions(v: number, digits: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < digits; i++) {
        const p = digits - 1 - i;
        if (!p) { out.push(v); continue; }
        const u = Math.pow(10, p), b = Math.floor(v / u), lower = v - b * u;
        out.push(b + smooth((lower - (u - CARRY)) / CARRY));
    }
    return out;
}
export function paintReels(strips: ArrayLike<HTMLElement>, pos: number[]) {
    for (let i = 0; i < strips.length; i++) {
        const m = ((pos[i] % 10) + 10) % 10;
        strips[i].style.transform = `translate3d(0, ${(-(m + 10) * 100 / 30).toFixed(3)}%, 0)`;
    }
}
export const REEL = Array.from({ length: 30 }, (_, k) => String(k % 10));
