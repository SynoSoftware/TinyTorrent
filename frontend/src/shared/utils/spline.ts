export interface SplinePoint {
    x: number;
    y: number;
}

const formatCoordinate = (value: number) => value.toFixed(2);

export const createSplinePoints = (
    values: number[],
    width: number,
    height: number,
    maxValue?: number
): SplinePoint[] => {
    if (!values.length) return [];
    const sourceMax = values.length ? Math.max(...values) : 1;
    const safeMax = Math.max(maxValue ?? sourceMax, 1);
    const span = values.length > 1 ? values.length - 1 : 1;

    return values.map((value, index) => {
        const factor = values.length > 1 ? index / span : 0;
        const normalized = Math.min(Math.max(value / safeMax, 0), 1);
        return {
            x: parseFloat((factor * width).toFixed(2)),
            y: parseFloat((height - normalized * height).toFixed(2)),
        };
    });
};

export const buildSplinePathFromPoints = (
    points: SplinePoint[],
    tension = 0.4
): string => {
    if (!points.length) return "";
    if (points.length === 1) {
        const point = points[0];
        return `M${formatCoordinate(point.x)},${formatCoordinate(point.y)}`;
    }

    let path = `M${formatCoordinate(points[0].x)},${formatCoordinate(
        points[0].y
    )}`;

    for (let index = 0; index < points.length - 1; index++) {
        const p0 = points[index - 1] ?? points[index];
        const p1 = points[index];
        const p2 = points[index + 1];
        const p3 = points[index + 2] ?? points[index + 1];

        const cp1 = {
            x: p1.x + (p2.x - p0.x) * tension,
            y: p1.y + (p2.y - p0.y) * tension,
        };
        const cp2 = {
            x: p2.x - (p3.x - p1.x) * tension,
            y: p2.y - (p3.y - p1.y) * tension,
        };

        path += ` C${formatCoordinate(cp1.x)},${formatCoordinate(
            cp1.y
        )} ${formatCoordinate(cp2.x)},${formatCoordinate(cp2.y)} ${formatCoordinate(
            p2.x
        )},${formatCoordinate(p2.y)}`;
    }

    return path;
};

export const buildSplinePath = (
    values: number[],
    width: number,
    height: number,
    maxValue?: number,
    tension?: number
): string =>
    buildSplinePathFromPoints(
        createSplinePoints(values, width, height, maxValue),
        tension
    );
