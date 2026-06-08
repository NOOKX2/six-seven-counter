"use client";

import { useEffect, useRef, useState } from "react";

type AnimatedCounterProps = {
  value: number;
  variant?: "default" | "overlay";
};

export default function AnimatedCounter({
  value,
  variant = "default",
}: AnimatedCounterProps) {
  const [pop, setPop] = useState(false);
  const prevValue = useRef(value);

  useEffect(() => {
    if (value > prevValue.current) {
      setPop(true);
      const timer = window.setTimeout(() => setPop(false), 450);
      prevValue.current = value;
      return () => window.clearTimeout(timer);
    }
    prevValue.current = value;
  }, [value]);

  const baseClass =
    variant === "overlay" ? "counter-display counter-overlay" : "counter-display";

  return (
    <p
      className={`${baseClass} ${pop ? "counter-pop" : ""}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {value}
    </p>
  );
}
