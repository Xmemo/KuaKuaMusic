import React from 'react';
import { KwaKwaState } from '../types';

interface KwaKwaProps {
  state: KwaKwaState;
  className?: string;
}

// KwaKwa: The Cybernetic Cockatoo
// Features: Speaker Beak, Waveform Crest, Headphones
const KwaKwa: React.FC<KwaKwaProps> = ({ state, className = "" }) => {
  
  const getAnimation = () => {
    switch (state) {
        case KwaKwaState.HYPE: return "animate-bounce"; // Headbanging
        case KwaKwaState.OVERHEAT: return "animate-pulse"; // Glitching
        case KwaKwaState.IDLE: return "animate-float"; // Breathing
        case KwaKwaState.AWKWARD: return ""; 
        default: return "animate-float";
    }
  };

  // Colors
  const isOverheat = state === KwaKwaState.OVERHEAT;
  const primaryColor = isOverheat ? "#333" : "#FFFFFF"; // Body
  const secondaryColor = isOverheat ? "#555" : "#FDE047"; // Crest (Yellow)
  const accentColor = isOverheat ? "#ef4444" : "#10B981"; // Tech accents

  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg 
        viewBox="0 0 200 220" 
        className={`w-full h-full transition-all duration-500 ease-in-out drop-shadow-2xl ${getAnimation()}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* --- CREST (The Mood Indicator) --- */}
        <g transform="translate(100, 70)" className="transition-transform duration-500">
             {/* IDLE: Droopy Crest */}
             {state === KwaKwaState.IDLE && (
                <path d="M-10 0 Q -30 -40 0 -50 Q 20 -30 10 0 Z" fill={secondaryColor} stroke="#333" strokeWidth="3" />
             )}
             {/* HYPE: Spiky Zigzag Crest */}
             {state === KwaKwaState.HYPE && (
                <path d="M-20 0 L -30 -60 L -10 -40 L 0 -70 L 10 -40 L 30 -60 L 20 0 Z" fill={secondaryColor} stroke="#333" strokeWidth="3" />
             )}
             {/* PRO: EQ Bars Crest */}
             {state === KwaKwaState.PRO && (
                 <g>
                    <rect x="-25" y="-50" width="10" height="50" fill={secondaryColor} stroke="#333" />
                    <rect x="-10" y="-70" width="10" height="70" fill={secondaryColor} stroke="#333" />
                    <rect x="5" y="-40" width="10" height="40" fill={secondaryColor} stroke="#333" />
                 </g>
             )}
             {/* EMO/MELANCHOLY: Flat Crest */}
             {state === KwaKwaState.EMO && (
                <path d="M-20 0 Q -40 10 -50 20 L -20 20 Z" fill={secondaryColor} stroke="#333" strokeWidth="3" />
             )}
             {/* OVERHEAT: Glitch/Broken Crest */}
             {isOverheat && (
                <path d="M-20 0 L -30 -30 L -10 -20 L 0 -50 L 10 -20 L 30 -30 L 20 0 Z" fill="#555" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" />
             )}
        </g>

        {/* --- HEADPHONES (Permanent Accessory) --- */}
        <path d="M30 110 C 30 40 170 40 170 110" fill="none" stroke="#60A5FA" strokeWidth="16" strokeLinecap="round" />
        <rect x="15" y="90" width="30" height="60" rx="10" fill="#3B82F6" stroke="#333" strokeWidth="3" />
        <rect x="155" y="90" width="30" height="60" rx="10" fill="#3B82F6" stroke="#333" strokeWidth="3" />

        {/* --- BODY (Bird Shape) --- */}
        <ellipse cx="100" cy="120" rx="60" ry="55" fill={primaryColor} stroke="#333" strokeWidth="4" />
        
        {/* --- FACE --- */}
        {/* Eyes */}
        {isOverheat ? (
             <g stroke="#ef4444" strokeWidth="4">
                 <line x1="70" y1="110" x2="80" y2="120" />
                 <line x1="80" y1="110" x2="70" y2="120" />
                 <line x1="120" y1="110" x2="130" y2="120" />
                 <line x1="130" y1="110" x2="120" y2="120" />
             </g>
        ) : (
             <g fill="#333">
                 <circle cx="75" cy="115" r={state === KwaKwaState.HYPE ? 8 : 5} />
                 <circle cx="125" cy="115" r={state === KwaKwaState.HYPE ? 8 : 5} />
             </g>
        )}

        {/* Glasses for PRO mode */}
        {state === KwaKwaState.PRO && (
             <g stroke="#333" strokeWidth="3" fill="none">
                 <circle cx="75" cy="115" r="15" fill="rgba(0,0,0,0.1)" />
                 <circle cx="125" cy="115" r="15" fill="rgba(0,0,0,0.1)" />
                 <line x1="90" y1="115" x2="110" y2="115" />
             </g>
        )}

        {/* Beak (Speaker Mesh) */}
        <path d="M90 125 L 110 125 L 100 145 Z" fill="#fbbf24" stroke="#333" strokeWidth="2" />
        <g fill="#333" opacity="0.5">
            <circle cx="95" cy="130" r="1" />
            <circle cx="100" cy="130" r="1" />
            <circle cx="105" cy="130" r="1" />
            <circle cx="97" cy="135" r="1" />
            <circle cx="103" cy="135" r="1" />
        </g>

        {/* --- EXTRAS --- */}
        {/* Sweat Drop for AWKWARD */}
        {state === KwaKwaState.AWKWARD && (
             <path d="M150 70 Q 150 60 155 50 Q 160 60 160 70 A 5 5 0 1 1 150 70" fill="#60a5fa" stroke="#2563eb" strokeWidth="2" transform="translate(-20, 20)" />
        )}

        {/* Smoke for OVERHEAT */}
        {isOverheat && (
            <g className="animate-pulse" opacity="0.6">
                 <circle cx="150" cy="50" r="10" fill="#555" />
                 <circle cx="165" cy="40" r="8" fill="#555" />
            </g>
        )}

      </svg>
    </div>
  );
};

export default KwaKwa;