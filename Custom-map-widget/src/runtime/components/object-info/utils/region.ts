import { MAX_RING_POINTS, RING_TOLERANCE } from '../constants';

export const simplifyRing = (ring: number[][]): number[][] => {
  if (!ring || ring.length < 4) {
    return ring || [];
  }

  const simplified: number[][] = [];
  const distance = (a: number[], b: number[]) =>
    Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

  simplified.push(ring[0]);

  for (let i = 1; i < ring.length - 1; i++) {
    const point = ring[i];
    const last = simplified[simplified.length - 1];
    if (distance(point, last) >= RING_TOLERANCE) {
      simplified.push(point);
    }
  }

  simplified.push(ring[ring.length - 1]);

  const ensureClosed = (target: number[][]) => {
    if (!target.length) {
      return;
    }
    const first = target[0];
    const last = target[target.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      target.push([...first]);
    }
  };

  ensureClosed(simplified);

  while (simplified.length > MAX_RING_POINTS) {
    const reduced: number[][] = [];
    for (let i = 0; i < simplified.length; i += 2) {
      reduced.push(simplified[i]);
    }
    ensureClosed(reduced);

    if (reduced.length < 4) {
      break;
    }

    simplified.splice(0, simplified.length, ...reduced);
  }

  return simplified.length >= 4 ? simplified : ring;
};

export const getRegionKey = (feature: any, index: number): string => {
  const props = feature?.properties || {};
  // Приводим SOATO коды к строке для консистентности
  return (
    (props.district_soato != null ? String(props.district_soato) : null) ||
    (props.region_soato != null ? String(props.region_soato) : null) ||
    (props.soato != null ? String(props.soato) : null) ||
    props.shapeISO ||
    props.shapeId ||
    props.shapeName ||
    `region-${index}`
  );
};

