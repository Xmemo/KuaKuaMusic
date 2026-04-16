import React, { useState } from 'react';
import { DeepDivePoint } from '../types';

interface FlipCardProps {
  data: DeepDivePoint;
  category: string;
}

const FlipCard: React.FC<FlipCardProps> = ({ data, category }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <div className="relative w-full h-72 group perspective-1000 cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
      <div className={`relative w-full h-full duration-700 transform-style-3d shadow-xl rounded-xl ${isFlipped ? 'rotate-y-180' : ''}`}>
        
        {/* Front: Public Translation */}
        <div className="absolute w-full h-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 backface-hidden flex flex-col justify-between overflow-hidden hover:bg-white/10 transition-colors">
          <div>
            <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400"></span>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/50">{category}</div>
            </div>
            <h3 className="text-xl font-bold text-white mb-3 line-clamp-2">{data.title}</h3>
            <p className="text-white/80 text-sm leading-relaxed font-light">"{data.publicText}"</p>
          </div>
          <div className="flex justify-end mt-2">
             <button className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 text-cyan-300 transition-colors bg-cyan-950/50 border border-cyan-900/50 px-3 py-1.5 rounded-full">
                👓 查看硬核解析
             </button>
          </div>
        </div>

        {/* Back: Geek Data (Scrollable) */}
        <div className="absolute w-full h-full bg-black border border-cyan-500/50 rounded-xl p-5 backface-hidden rotate-y-180 flex flex-col justify-between shadow-[0_0_15px_rgba(6,182,212,0.15)]">
          <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
             <div className="flex justify-between items-center mb-3 sticky top-0 bg-black py-1 z-10 border-b border-white/10">
                <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono font-bold">PRO ANALYSIS</div>
             </div>
             <p className="text-cyan-50/90 font-mono text-xs leading-relaxed text-justify whitespace-pre-line">
                {data.geekText}
             </p>
          </div>
          <div className="flex justify-end mt-2 pt-2 border-t border-white/10">
             <button className="text-[10px] font-bold flex items-center gap-1 text-zinc-500 hover:text-white transition-colors">
                ↩ 普通模式
             </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FlipCard;