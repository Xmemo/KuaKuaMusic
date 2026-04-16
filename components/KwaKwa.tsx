import React from 'react';
import { KwaKwaState } from '../types';

interface KwaKwaProps {
  state: KwaKwaState;
  className?: string;
}

const KwaKwa: React.FC<KwaKwaProps> = ({ state, className = "" }) => {
  const getAnimation = () => {
    switch (state) {
      case KwaKwaState.HYPE:
        return "animate-micro-float";
      case KwaKwaState.OVERHEAT:
        return "animate-pulse";
      case KwaKwaState.IDLE:
        return "animate-float";
      case KwaKwaState.AWKWARD:
        return "";
      default:
        return "animate-float";
    }
  };

  const stateImageMap: Record<KwaKwaState, string> = {
    [KwaKwaState.IDLE]: "/logo-idle.png",
    [KwaKwaState.HYPE]: "/logo-hype.png",
    [KwaKwaState.PRO]: "/logo-pro.png",
    [KwaKwaState.EMO]: "/logo-emo.png",
    [KwaKwaState.OVERHEAT]: "/logo-overheat.png",
    [KwaKwaState.AWKWARD]: "/logo-awkward.png",
  };

  const stateToneClassMap: Record<KwaKwaState, string> = {
    [KwaKwaState.IDLE]: "",
    [KwaKwaState.HYPE]: "saturate-150",
    [KwaKwaState.PRO]: "contrast-125",
    [KwaKwaState.EMO]: "opacity-90 saturate-50",
    [KwaKwaState.OVERHEAT]: "grayscale brightness-75",
    [KwaKwaState.AWKWARD]: "grayscale opacity-80",
  };

  const isOverheat = state === KwaKwaState.OVERHEAT;

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <img
        src={stateImageMap[state] || "/logo-main.png"}
        alt="夸夸音乐 Logo"
        className={`w-full h-full object-contain transition-all duration-500 ease-in-out drop-shadow-2xl ${getAnimation()} ${stateToneClassMap[state] || ""}`}
      />
      {isOverheat && (
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-red-500/70 animate-pulse" />
      )}
    </div>
  );
};

export default KwaKwa;
