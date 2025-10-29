import React, { useId } from "react";

interface SolanaTokenIconProps {
  className?: string;    // control rendered size, e.g. "w-8 h-8"
  symbol?: string;       // e.g. "SOL", "USDC"
  showSymbol?: boolean;  // show ticker pill or not
  bgColor?: string;      // inner circle color
  ringColor?: string;    // subtle rim stroke color
  fromColor?: string;    // gradient start for bars
  toColor?: string;      // gradient end for bars
}

const SolanaTokenIcon: React.FC<SolanaTokenIconProps> = ({
  className = "w-8 h-8",
  symbol = "SPL",
  showSymbol = true,
  bgColor = "#0B0B12",          // deep black/purple-ish fill
  ringColor = "rgba(255,255,255,0.08)",
  fromColor = "#00FFA3",        // Solana neon green
  toColor = "#DC1FFF",          // Solana magenta
}) => {
  const gradientId = useId();

  const displaySymbol =
    symbol.length > 4 ? symbol.slice(0, 4).toUpperCase() : symbol.toUpperCase();

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={`${gradientId}-title`}
    >
      <title id={`${gradientId}-title`}>
        {showSymbol ? `${displaySymbol} token` : "Token"}
      </title>

      <defs>
        {/* Solana-style gradient */}
        <linearGradient
          id={gradientId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="0%"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={fromColor} />
          <stop offset="100%" stopColor={toColor} />
        </linearGradient>
      </defs>

      {/* Outer subtle rim */}
      <circle
        cx={32}
        cy={32}
        r={30}
        fill={bgColor}
        stroke={ringColor}
        strokeWidth={2}
      />

      {/* Inner soft inset ring for depth */}
      <circle
        cx={32}
        cy={32}
        r={22}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={2}
        opacity={0.4}
      />

      {/*
        Solana bars:
        - made smaller
        - centered in the coin
        - rotated a bit for the Solana vibe
        We draw them around the (32,32) region and then rotate the whole group.
      */}
      <g transform="rotate(-10 32 32)">
        {/* top bar */}
        <rect
          x={20}
          y={24}
          width={24}
          height={6}
          rx={3}
          fill={`url(#${gradientId})`}
        />
        {/* middle bar */}
        <rect
          x={20}
          y={31}
          width={24}
          height={6}
          rx={3}
          fill={`url(#${gradientId})`}
          opacity={0.9}
        />
        {/* bottom bar */}
        <rect
          x={20}
          y={38}
          width={24}
          height={6}
          rx={3}
          fill={`url(#${gradientId})`}
          opacity={0.8}
        />
      </g>

      {/* Optional small ticker pill near bottom */}
      {showSymbol && (
        <g>
          {/* pill bg */}
          <rect
            x={28}
            y={45}
            width={20}
            height={12}
            rx={4}
            fill="rgba(255,255,255,0.07)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
          />
          {/* ticker text */}
          <text
            x={38}
            y={51}
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
            fontSize={7}
            fontWeight={600}
            fill="#FFFFFF"
            style={{ letterSpacing: "0.03em" }}
            dominantBaseline="middle"
          >
            {displaySymbol}
          </text>
        </g>
      )}
    </svg>
  );
};

export default SolanaTokenIcon;
