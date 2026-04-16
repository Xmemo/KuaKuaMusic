import React, { useState, useEffect } from 'react';
import KwaKwa from './components/KwaKwa';
import FlipCard from './components/FlipCard';
import { identifySong, analyzeSong } from './services/zhipuService';
import { AppState, SongMetadata, PraiseContent, KwaKwaState, DAILY_LIMIT } from './types';

declare var chrome: any;

function App() {
  const [appState, setAppState] = useState<AppState>('HOME');
  const [query, setQuery] = useState('');
  const [songData, setSongData] = useState<SongMetadata | null>(null);
  const [praiseData, setPraiseData] = useState<PraiseContent | null>(null);
  const [activeTab, setActiveTab] = useState<'emo' | 'hype' | 'pro'>('emo');
  const [errorMsg, setErrorMsg] = useState('');


  // --- CHROME LISTENER ---
  useEffect(() => {
    const handleMessage = async (message: any, sender: any, sendResponse: any) => {
      if (message.type === 'SONG_CHANGE' && message.payload) {
        const { title, artist, coverUrl, platform } = message.payload;
        if (songData && songData.title === title && songData.artist === artist) return;
        
        console.log("夸夸音乐 - New Song:", title);
        setSongData({ title, artist, coverUrl, platform });
        setAppState('HOME'); 
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener(handleMessage);
        return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }
  }, [songData]);

  // --- ACTIONS ---

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    performIdentification(query);
  };

  const performIdentification = async (q: string) => {
      setErrorMsg('');
      setAppState('SEARCHING');
      try {
          const meta = await identifySong(q);
          setSongData(meta);
          setAppState('HOME'); 
      } catch (e) {
          setErrorMsg("KwaKwa 找不到這首歌");
          setAppState('ERROR');
      }
  }

  const handleHypeIt = async () => {
      if (!songData) return;
      
      setAppState('ANALYZING');
      setErrorMsg('');

      try {
          const analysis = await analyzeSong(songData);
          setPraiseData(analysis);
          setAppState('RESULT');
          if (analysis.isBadSong) setActiveTab('hype');
      } catch (err) {
          console.error(err);
          setErrorMsg("KwaKwa 過熱了... (Server Busy)");
          setAppState('ERROR');
      }
  };

  const handleReset = () => {
    setAppState('HOME');
    setQuery('');
    setSongData(null);
    setPraiseData(null);
    setActiveTab('emo');
  };

  // --- STYLES ---
  const getBackgroundStyle = () => {
    // Enforce a consistent dark theme even in result page
    return { background: 'radial-gradient(circle at 50% 10%, #1e1e24 0%, #000000 70%)' };
  };

  // --- RENDERERS ---

  const renderHome = () => (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center pb-10 pt-10">
      <div className="relative w-[22rem] max-w-[92vw] aspect-[11/6] mb-8">
           <KwaKwa state={KwaKwaState.IDLE} className="w-full h-full" />
           {/* Notification Bubble */}
           {songData && (
               <div className="absolute -top-3 right-0 bg-yellow-400 text-black text-xs font-black italic px-3 py-1 rounded-none transform rotate-3 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                   NEW VIBE!
               </div>
           )}
      </div>
      
      <h1 className="text-4xl font-black tracking-tighter mb-2 text-white transform -skew-x-3">
        夸夸音乐
      </h1>
      <p className="text-zinc-300 text-sm max-w-xl leading-relaxed mb-10 px-2">
        输入歌名，夸夸音乐会立刻生成 3 种风格的高质量夸歌文案（走心 / 上头 / 懂行），让你夸得云淡风轻又阳春白雪。
      </p>
      
      {songData ? (
          <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-xl p-4 mb-6 backdrop-blur-sm relative group overflow-hidden">
              <div className="flex items-center gap-4 z-10 relative">
                  <div className="relative w-16 h-16 flex-shrink-0">
                       <div className="absolute -right-6 top-1 w-14 h-14 bg-black rounded-full border border-zinc-800 flex items-center justify-center animate-[spin_4s_linear_infinite]">
                          <div className="w-4 h-4 bg-zinc-800 rounded-full border border-zinc-700"></div>
                       </div>
                       <img src={songData.coverUrl || 'https://via.placeholder.com/50'} className="w-16 h-16 object-cover relative z-10 shadow-lg rounded" />
                  </div>
                  
                  <div className="text-left overflow-hidden flex-1 pl-2">
                      <h3 className="font-bold text-white truncate text-lg leading-tight">{songData.title}</h3>
                      <p className="text-xs text-zinc-400 truncate font-mono uppercase">{songData.artist}</p>
                  </div>
              </div>
              
              <button 
                  onClick={handleHypeIt}
                  className="mt-4 w-full bg-yellow-400 hover:bg-yellow-300 text-black font-black uppercase py-3 text-sm rounded-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2 tracking-wide"
              >
                  ⚡ 立即生成夸歌文案
              </button>
          </div>
      ) : (
        <form onSubmit={handleManualSearch} className="w-full max-w-sm relative mb-8">
            <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="正在監聽...或手動輸入"
            className="w-full bg-white/10 border border-white/20 rounded-full py-3 px-6 text-center text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all font-mono"
            />
        </form>
      )}
      
      <div className="absolute bottom-4 text-[10px] text-zinc-600 font-mono tracking-widest">
          v2.0 • FOR UNLIMITED PRAISING
      </div>
    </div>
  );

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
      <div className="relative mb-8 w-[22rem] max-w-[92vw] aspect-[11/6]">
          <div className="absolute inset-0 bg-yellow-400/10 blur-3xl opacity-20 rounded-full"></div>
          <KwaKwa state={KwaKwaState.HYPE} className="w-full h-full relative z-10" />
      </div>
      <h2 className="text-2xl font-black text-white italic transform -skew-x-6 mb-2">
        夸夸生成中...
      </h2>
      <div className="flex flex-col gap-1 text-zinc-500 text-[10px] font-mono uppercase tracking-wider">
        <span className="animate-[pulse_1s_infinite_0ms]">正在识别歌曲信息...</span>
        <span className="animate-[pulse_1s_infinite_200ms]">正在分析音乐风格...</span>
        <span className="animate-[pulse_1s_infinite_400ms]">正在生成夸歌文案...</span>
      </div>
    </div>
  );


  const renderResult = () => {
    if (!praiseData || !songData) return null;

    return (
      <div className="w-full min-h-screen pb-10 pt-4 px-4 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
            <button onClick={handleReset} className="text-white/60 hover:text-white flex items-center gap-1 text-sm font-bold">
                &larr; BACK
            </button>
            <div className="text-[10px] font-black tracking-[0.2em] text-white/20">夸夸音乐</div>
        </div>

        {/* AREA A: The Hook & Vinyl Visual */}
        <section className="relative mb-8 flex flex-col items-center text-center">
           <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
              {/* Spinning record effect bg */}
              <div className="absolute inset-0 rounded-full bg-black/40 border border-white/5 animate-[spin_10s_linear_infinite] shadow-2xl">
                 <div className="absolute inset-[10%] rounded-full border border-white/5 opacity-50"></div>
                 <div className="absolute inset-[20%] rounded-full border border-white/5 opacity-40"></div>
                 <div className="absolute inset-[30%] rounded-full border border-white/5 opacity-30"></div>
              </div>
              
              {/* Album Art as Label */}
              <div className="absolute w-20 h-20 rounded-full overflow-hidden animate-[spin_10s_linear_infinite]">
                  <img src={songData.coverUrl} className="w-full h-full object-cover opacity-60" />
              </div>

              {/* KwaKwa on top */}
              <KwaKwa state={praiseData.kwaKwaState} className="w-full h-full relative z-10 drop-shadow-2xl scale-90" />
           </div>
           
           <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">{songData.title}</h1>
           <p className="text-white/60 mb-6 font-mono text-sm uppercase tracking-widest">{songData.artist}</p>
        </section>

        {/* AREA B: Highlights (Tabs) */}
        <section className="mb-12">
            <div className="flex p-1 bg-white/10 rounded-xl mb-6 backdrop-blur-md">
                {(['emo', 'hype', 'pro'] as const).map((mode) => (
                    <button
                        key={mode}
                        onClick={() => setActiveTab(mode)}
                        className={`flex-1 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                            activeTab === mode 
                            ? 'bg-yellow-400 text-black shadow-lg' 
                            : 'text-white/40 hover:text-white'
                        }`}
                    >
                        {mode === 'emo' ? 'Emo 走心' : mode === 'hype' ? 'Hype 上頭' : 'Pro 懂行'}
                    </button>
                ))}
            </div>
            
            <div className="bg-white/5 p-6 rounded-2xl border border-white/10 min-h-[140px] flex items-center justify-center shadow-inner backdrop-blur-sm">
                 <p className="text-lg text-center leading-relaxed text-white font-medium italic">
                     "{praiseData.modes[activeTab]}"
                 </p>
            </div>
        </section>

        {/* AREA C: Deep Dive (Sandwich Method) - Vertical Stack Layout */}
        <section className="mb-10">
            <h3 className="text-white/50 text-xs font-bold uppercase tracking-[0.3em] mb-6 flex items-center gap-4 justify-center">
                <span className="w-8 h-[1px] bg-white/20 inline-block"></span>
                DEEP DIVE
                <span className="w-8 h-[1px] bg-white/20 inline-block"></span>
            </h3>
            <div className="space-y-4">
                <FlipCard category="CULTURE / 文化" data={praiseData.deepDive.culture} />
                <FlipCard category="HARMONY / 和聲" data={praiseData.deepDive.harmony} />
                <FlipCard category="RHYTHM / 律動" data={praiseData.deepDive.rhythm} />
                <FlipCard category="TIMBRE / 音色" data={praiseData.deepDive.timbre} />
            </div>
        </section>

        {/* Footer */}
        <div className="flex gap-4">
             <button className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs py-4 rounded-xl font-bold uppercase tracking-wider transition-colors border border-white/5">
                Share Quote
            </button>
            <button className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black text-xs py-4 rounded-xl font-bold uppercase tracking-wider transition-colors shadow-lg shadow-yellow-400/20">
                Save Card
            </button>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="min-h-screen transition-colors duration-1000 ease-in-out font-sans selection:bg-yellow-400 selection:text-black"
      style={getBackgroundStyle()}
    >
      {appState === 'HOME' && renderHome()}
      {(appState === 'SEARCHING' || appState === 'ANALYZING') && renderLoading()}
      {appState === 'ERROR' && (
           <div className="flex flex-col items-center justify-center min-h-screen text-center px-4">
            <KwaKwa state={KwaKwaState.OVERHEAT} className="w-32 h-32 mb-6" />
            <h2 className="text-lg font-bold text-red-500 mb-2">CRITICAL ERROR</h2>
            <p className="text-zinc-400 text-sm mb-6">{errorMsg}</p>
            <button onClick={handleReset} className="px-6 py-2 bg-zinc-800 rounded text-white text-xs uppercase tracking-wider hover:bg-zinc-700">Reboot System</button>
          </div>
      )}
      {appState === 'RESULT' && renderResult()}
    </div>
  );
}

export default App;
