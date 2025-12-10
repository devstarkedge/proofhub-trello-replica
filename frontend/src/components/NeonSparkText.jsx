import React, { useEffect, useRef, useState } from 'react';

const NeonSparkText = ({ text, className = '' }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = ''; // Clear container

    // Create main text element with gradient
    const textElement = document.createElement('span');
    textElement.textContent = text;
    textElement.className = 'neon-text-main';
    textElement.style.fontSize = 'inherit';
    textElement.style.fontWeight = 'inherit';
    textElement.style.position = 'relative';
    textElement.style.zIndex = '2';

    container.appendChild(textElement);

    // Create sparkle elements
    const sparkleCount = 15;
    const sparkles = [];

    for (let i = 0; i < sparkleCount; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'neon-sparkle';
      sparkle.style.position = 'absolute';
      sparkle.style.width = '4px';
      sparkle.style.height = '4px';
      sparkle.style.borderRadius = '50%';
      sparkle.style.backgroundColor = `rgba(255, ${150 + Math.random() * 105}, ${Math.random() * 100}, 0.8)`;
      sparkle.style.zIndex = '3';
      sparkle.style.pointerEvents = 'none';

      // Random position around text
      const xPos = Math.random() * 100;
      const yPos = Math.random() * 50 - 10; // Slightly above/below text

      sparkle.style.left = `${xPos}%`;
      sparkle.style.top = `${yPos}%`;
      sparkle.style.transform = `translate(-50%, -50%)`;

      // Random animation delay and duration
      sparkle.style.animation = `sparkleTwinkle ${2 + Math.random() * 3}s ease-in-out infinite ${Math.random() * 3}s`;

      container.appendChild(sparkle);
      sparkles.push(sparkle);
    }

    // Create glow effect
    const glowElement = document.createElement('div');
    glowElement.className = 'neon-glow-effect';
    glowElement.style.position = 'absolute';
    glowElement.style.width = '100%';
    glowElement.style.height = '100%';
    glowElement.style.background = 'radial-gradient(circle, rgba(255, 152, 0, 0.1) 0%, rgba(255, 152, 0, 0) 70%)';
    glowElement.style.zIndex = '1';
    glowElement.style.pointerEvents = 'none';
    glowElement.style.animation = 'neonPulse 3s ease-in-out infinite alternate';

    container.appendChild(glowElement);

    // Add moving shine overlay
    const shineOverlay = document.createElement('div');
    shineOverlay.className = 'neon-shine-overlay';
    container.appendChild(shineOverlay);

    // Cleanup
    return () => {
      container.innerHTML = '';
    };
  }, [text]);

  return (
    <span
      ref={containerRef}
      className={`neon-spark-text-container relative inline-block ${className}`}
      style={{
        fontSize: 'inherit',
        fontWeight: 'inherit',
        lineHeight: 'inherit'
      }}
    >
      {/* Fallback content */}
      <span className="neon-spark-text-fallback">
        {text}
      </span>
    </span>
  );
};

export default NeonSparkText;