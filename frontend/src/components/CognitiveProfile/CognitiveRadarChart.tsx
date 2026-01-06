/**
 * CognitiveRadarChart Component
 * 
 * Displays cognitive profile as a radar/spider chart.
 */

import React from 'react';
import { CognitiveProfile } from '../../games/types';
import './CognitiveRadarChart.css';

interface CognitiveRadarChartProps {
  profile: CognitiveProfile;
  size?: number;
}

export const CognitiveRadarChart: React.FC<CognitiveRadarChartProps> = ({
  profile,
  size = 300,
}) => {
  const center = size / 2;
  const maxRadius = (size / 2) - 40;

  // Data points for the radar chart
  const dataPoints = [
    { label: 'Processing Speed', value: profile.processingSpeedIndex, angle: 0 },
    { label: 'Memory', value: profile.memoryIndex, angle: 60 },
    { label: 'Attention', value: profile.attentionIndex, angle: 120 },
    { label: 'Visual Memory', value: profile.indices.visualMemory, angle: 180 },
    { label: 'Verbal Memory', value: profile.indices.verbalMemory, angle: 240 },
    { label: 'Consistency', value: profile.consistencyScore, angle: 300 },
  ];

  // Calculate polygon points
  const getPoint = (angle: number, value: number) => {
    const radian = (angle - 90) * (Math.PI / 180);
    const radius = (value / 100) * maxRadius;
    return {
      x: center + radius * Math.cos(radian),
      y: center + radius * Math.sin(radian),
    };
  };

  // Create polygon path
  const polygonPoints = dataPoints
    .map(d => {
      const point = getPoint(d.angle, d.value);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  // Create reference circles
  const referenceCircles = [25, 50, 75, 100].map(value => {
    const radius = (value / 100) * maxRadius;
    return (
      <circle
        key={value}
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth="1"
      />
    );
  });

  // Create axis lines
  const axisLines = dataPoints.map(d => {
    const endPoint = getPoint(d.angle, 100);
    return (
      <line
        key={d.angle}
        x1={center}
        y1={center}
        x2={endPoint.x}
        y2={endPoint.y}
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth="1"
      />
    );
  });

  // Create labels
  const labels = dataPoints.map(d => {
    const labelPoint = getPoint(d.angle, 115);
    return (
      <text
        key={d.label}
        x={labelPoint.x}
        y={labelPoint.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(255, 255, 255, 0.8)"
        fontSize="12"
        fontWeight="500"
      >
        {d.label}
      </text>
    );
  });

  // Create data point markers
  const markers = dataPoints.map(d => {
    const point = getPoint(d.angle, d.value);
    return (
      <g key={`marker-${d.angle}`}>
        <circle
          cx={point.x}
          cy={point.y}
          r="5"
          fill="#667eea"
          stroke="white"
          strokeWidth="2"
        />
        <text
          x={point.x}
          y={point.y - 15}
          textAnchor="middle"
          fill="white"
          fontSize="11"
          fontWeight="600"
        >
          {d.value}
        </text>
      </g>
    );
  });

  return (
    <div className="cognitive-radar-chart">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circles */}
        {referenceCircles}
        
        {/* Axis lines */}
        {axisLines}
        
        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill="rgba(102, 126, 234, 0.3)"
          stroke="#667eea"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        
        {/* Data point markers */}
        {markers}
        
        {/* Labels */}
        {labels}
      </svg>
    </div>
  );
};
