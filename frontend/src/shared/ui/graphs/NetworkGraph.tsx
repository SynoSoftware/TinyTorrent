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
    const max = Math.max(...data, 1);
    const points = data
        .map((val, i) => {
            // scale to viewBox 64x24
            const x = (i / (data.length - 1)) * 64;
            const y = 24 - (val / max) * 24;
            return `${x},${y}`;
        })
        .join(" ");

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
            <path
                d={`M0,24 ${points
                    .split(" ")
                    .map((p) => `L${p}`)
                    .join(" ")} L64,24 Z`}
                className={cn(
                    "opacity-20",
                    color === "success" ? "text-success" : "text-primary"
                )}
                fill={`url(#grad-${color})`}
            />
            <path
                d={`M0,24 L0,24 ${points
                    .split(" ")
                    .map((p) => `L${p}`)
                    .join(" ")}`}
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
