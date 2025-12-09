import { useMemo } from 'react';

interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: 'gain' | 'loss';
  strokeWidth?: number;
}

const SparklineChart = ({
  data,
  width = 120,
  height = 40,
  color,
  strokeWidth = 1.5,
}: SparklineChartProps) => {
  const { path, areaPath, strokeColor, fillColor } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: '', areaPath: '', strokeColor: '#6b7280', fillColor: 'none' };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const padding = 2;
    const effectiveWidth = width - padding * 2;
    const effectiveHeight = height - padding * 2;

    const points = data.map((value, index) => {
      const x = padding + (index / (data.length - 1)) * effectiveWidth;
      const y = padding + effectiveHeight - ((value - min) / range) * effectiveHeight;
      return { x, y };
    });

    const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Determine color based on trend
    const isPositive = color === 'gain' || (!color && data[data.length - 1] > data[0]);
    const stroke = isPositive ? 'hsl(158, 64%, 43%)' : 'hsl(356, 75%, 57%)';
    const fill = isPositive ? 'url(#sparklineGradientGreen)' : 'url(#sparklineGradientRed)';

    // Create area path
    const areaData = `${pathData} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

    return { path: pathData, areaPath: areaData, strokeColor: stroke, fillColor: fill };
  }, [data, width, height, color]);

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id="sparklineGradientGreen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(158, 64%, 43%)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="hsl(158, 64%, 43%)" stopOpacity={0} />
        </linearGradient>
        <linearGradient id="sparklineGradientRed" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(356, 75%, 57%)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="hsl(356, 75%, 57%)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={fillColor} />
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default SparklineChart;
