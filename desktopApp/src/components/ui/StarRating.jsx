import React from 'react';

const StarSVG = ({ size = 16, fill = '#F59E0B' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.402 8.167L12 18.896l-7.336 3.967 1.402-8.167L.132 9.21l8.2-1.192L12 .587z"
      fill={fill}
    />
  </svg>
);

const StarRating = ({ value = 0, size = 14 }) => {
  const normalized = Math.max(0, Math.min(5, Number(value) || 0));

  const stars = Array.from({ length: 5 }).map((_, i) => {
    const fill = Math.max(0, Math.min(1, normalized - i));
    const pct = Math.round(fill * 100);

    return (
      <span
        key={i}
        className="relative inline-block"
        style={{ width: size, height: size, display: 'inline-block' }}
        aria-hidden="true"
      >
        {/* Background (empty) star */}
        <StarSVG size={size} fill="#E5E7EB" />

        {/* Foreground (filled) star clipped to percentage */}
        {pct > 0 && (
          <span
            className="absolute top-0 left-0 overflow-hidden"
            style={{ width: `${pct}%`, height: size, display: 'inline-block' }}
          >
            <StarSVG size={size} fill="#FBBF24" />
          </span>
        )}
      </span>
    );
  });

  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`Rating: ${normalized} out of 5`}
      title={`${normalized} / 5`}
    >
      {stars}
    </span>
  );
};

export default StarRating;
