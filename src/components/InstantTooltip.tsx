'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface InstantTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'auto';
  className?: string;
}

export default function InstantTooltip({
  content,
  children,
  position = 'auto',
  className = '',
}: InstantTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean }>({
    top: 0,
    left: 0,
    placeAbove: true,
  });
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const placeAbove =
      position === 'top'
        ? true
        : position === 'bottom'
        ? false
        : rect.top > 60; // Auto: place above unless too close to top

    setCoords({
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(170, Math.min(window.innerWidth - 170, rect.left + rect.width / 2)),
      placeAbove,
    });
  }, [position]);

  const handleMouseEnter = () => {
    if (!content) return;
    updatePosition();
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  useEffect(() => {
    if (!isVisible) return;
    const handleScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isVisible, updatePosition]);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`inline-flex items-center justify-center ${className}`}
    >
      {children}
      {mounted &&
        isVisible &&
        content &&
        createPortal(
          <div
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform: coords.placeAbove
                ? 'translate(-50%, -100%)'
                : 'translate(-50%, 0)',
            }}
            className="fixed z-[9999] pointer-events-none px-3 py-2 bg-slate-900/95 backdrop-blur-sm text-white text-xs font-medium rounded-xl shadow-2xl border border-slate-700/80 leading-normal max-w-[340px] sm:max-w-[420px] transition-opacity duration-75 select-none animate-in fade-in zoom-in-95"
          >
            {content}
            {/* Arrow pointer */}
            <div
              className={`absolute left-1/2 -translate-x-1/2 border-4 border-transparent ${
                coords.placeAbove
                  ? 'top-full border-t-slate-900'
                  : 'bottom-full border-b-slate-900'
              }`}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
