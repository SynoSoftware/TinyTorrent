import { cn } from "@heroui/react";

interface NetworkGraphProps {
    data: number[];
    color: string;
    className?: string;
}

export const NetworkGraph = ({
    data,
    color,
    className,
}: NetworkGraphProps) => {
    const normalizedData = data.length ? data : [0];
    const max = Math.max(...normalizedData, 1);
    const span = Math.max(1, normalizedData.length - 1);
    const points = normalizedData.map((val, i) => {
        const factor = normalizedData.length > 1 ? i / span : 0;
        const x = factor * 64;
        const y = 24 - (val / max) * 24;
        return { x, y };
    });
    const buildLine = () =>
        points
            .map((point, index) =>
                index === 0
                    ? `M${point.x},${point.y}`
                    : `L${point.x},${point.y}`
            )
            .join(" ");
    const linePath = buildLine();
    const areaPath =
        points.length > 0
            ? `${linePath} L${points[points.length - 1].x},24 L${points[0].x},24 Z`
            : "";

    return (
        <svg
            width="100%"
            height="100%"
            viewBox="0 0 64 24"
            preserveAspectRatio="none"
            className={cn("overflow-visible", className)}
        >
            <line
                x1={0}
                y1={23.5}
                x2={64}
                y2={23.5}
                stroke="currentColor"
                strokeWidth={1}
                className="opacity-10"
            />
            {data.every((value) => value === 0) && (
                <line
                    x1={0}
                    y1={23.5}
                    x2={64}
                    y2={23.5}
                    stroke="currentColor"
                    strokeWidth={2}
                    className={cn(
                        "opacity-60",
                        color === "success" ? "text-success" : "text-primary"
                    )}
                />
            )}
            <defs>
                <filter
                    id={`glow-${color}`}
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                >
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite
                        in="SourceGraphic"
                        in2="blur"
                        operator="over"
                    />
                </filter>
                <linearGradient
                    id={`grad-${color}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                >
                    <stop
                        offset="0%"
                        stopColor="currentColor"
                        stopOpacity="0.5"
                    />
                    <stop
                        offset="100%"
                        stopColor="currentColor"
                        stopOpacity="0"
                    />
                </linearGradient>
            </defs>
            {areaPath && (
                <path
                    d={areaPath}
                    className={cn(
                        "opacity-20",
                        color === "success" ? "text-success" : "text-primary"
                    )}
                    fill={`url(#grad-${color})`}
                />
            )}
            <path
                d={
                    linePath ||
                    "M0,24 L64,24"
                }
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                    color === "success" ? "text-success" : "text-primary"
                )}
                filter={`url(#glow-${color})`}
            />
        </svg>
    );
};
