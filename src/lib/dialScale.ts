export const radiusSteps = [
  ...Array.from({ length: 50 }, (_, index) => index + 1),
  ...Array.from({ length: 20 }, (_, index) => 55 + index * 5),
  ...Array.from({ length: 14 }, (_, index) => 175 + index * 25),
] as const;

export function positionToValue(t: number): number {
  const index = Math.round(Math.min(1, Math.max(0, t)) * (radiusSteps.length - 1));
  return radiusSteps[index] ?? 1;
}

export function valueToPosition(value: number): number {
  const exact = radiusSteps.indexOf(value as (typeof radiusSteps)[number]);
  if (exact >= 0) return exact / (radiusSteps.length - 1);
  let nearest = 0;
  for (let index = 1; index < radiusSteps.length; index += 1) {
    if (Math.abs((radiusSteps[index] ?? 1) - value) < Math.abs((radiusSteps[nearest] ?? 1) - value)) nearest = index;
  }
  return nearest / (radiusSteps.length - 1);
}
