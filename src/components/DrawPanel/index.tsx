import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface DrawPanelProps {
  lastDrawn: number | null;
  drawnNumbers: number[];
  onDraw: () => Promise<void>;
  autoInterval: number | null;
  gameRunning: boolean;
}

export const DrawPanel: React.FC<DrawPanelProps> = ({
  drawnNumbers,
  onDraw,
  autoInterval,
  gameRunning,
}) => {
  const { t } = useTranslation();
  const [drawing, setDrawing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleDraw = async () => {
    if (drawing || !gameRunning) return;
    setDrawing(true);
    try {
      await onDraw();
    } finally {
      setDrawing(false);
    }
  };

  // Auto-draw logic
  useEffect(() => {
    if (!autoInterval || !gameRunning) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      setCountdown(null);
      return;
    }

    setCountdown(autoInterval);

    intervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return autoInterval;
        if (c <= 1) {
          return autoInterval;
        }
        return c - 1;
      });
    }, 1000);

    const runDraw = async () => {
      setDrawing(true);
      try {
        await onDraw();
      } finally {
        setDrawing(false);
      }
      setCountdown(autoInterval);
    };

    timerRef.current = setTimeout(async function tick() {
      await runDraw();
      timerRef.current = setTimeout(tick, autoInterval * 1000);
    }, autoInterval * 1000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInterval, gameRunning]);

  return (
    <div className="glass-card p-4 sm:p-6">
      {/* Auto countdown indicator */}
      {autoInterval && countdown !== null && gameRunning && (
        <div className="text-center text-sm text-white/60 mb-3">
          {t('host.nextIn')} {countdown}s
        </div>
      )}

      {/* Draw button (manual mode) */}
      {!autoInterval && (
        <button
          className="btn-primary w-full text-lg py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleDraw}
          disabled={drawing || !gameRunning}
        >
          {drawing ? t('host.drawing') : t('host.drawNumber')}
        </button>
      )}

      {drawnNumbers.length === 0 && (
        <div className="text-center text-white/40 text-sm mt-2">
          {t('host.noNumbersYet')}
        </div>
      )}
    </div>
  );
};
