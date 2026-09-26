import React, { useState, useEffect } from 'react';
import KwaKwa from './components/KwaKwa';
import FlipCard from './components/FlipCard';
import { searchSongs, analyzeSong, askAboutSong } from './services/musicService';
import { AppState, SongMetadata, PraiseContent, KwaKwaState, DAILY_LIMIT } from './types';

declare var chrome: any;

function App() {
  const [appState, setAppState] = useState<AppState>('HOME');
  const [query, setQuery] = useState('');
  const [songData, setSongData] = useState<SongMetadata | null>(null);
  const [praiseData, setPraiseData] = useState<PraiseContent | null>(null);
  const [activeTab, setActiveTab] = useState<'emo' | 'hype' | 'pro'>('emo');
  const [errorMsg, setErrorMsg] = useState('');
  const [searchResults, setSearchResults] = useState<SongMetadata[]>([]);
  const [question, setQuestion] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');


  // --- CHROME LISTENER ---
  useEffect(() => {
    const handleMessage = async (message: any, sender: any, sendResponse: any) => {
      if (message.type === 'SONG_CHANGE' && message.payload) {
        const { title, artist, coverUrl, platform } = message.payload;
        if (songData && songData.title === title && songData.artist === artist) return;
        
        console.log("夸夸音乐 - New Song:", title);
        const meta = { title, artist, coverUrl, platform };
        setSongData(meta);
        setSearchResults([]);
        setPraiseData(null);
        setQuestion('');
        setQuestionAnswers([]);
        setQuestionError('');
        handleHypeItInternal(meta);
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
      setSearchResults([]);
      setAppState('SEARCHING');
      try {
          const matches = await searchSongs(q);
          if (!matches.length) {
              setErrorMsg('沒有找到相符歌曲，請試試「歌名 + 歌手」或貼上歌曲連結。');
              setAppState('HOME');
              return;
          }
          setSearchResults(matches);
          setAppState('SEARCH_RESULTS');
      } catch (e) {
          console.error("Music Search Error:", e);
          const msg = e instanceof Error ? e.message : "歌曲搜索失败，请稍后重试。";
          setErrorMsg(msg);
          setAppState('HOME');
      }
  }

  const handleSelectSong = (meta: SongMetadata) => {
      setSongData(meta);
      setSearchResults([]);
      setPraiseData(null);
      setQuestionAnswers([]);
      setQuestionError('');
      handleHypeItInternal(meta);
  }

  const handleHypeIt = async () => {
    if (!songData) return;
    handleHypeItInternal(songData);
  };

  const handleHypeItInternal = async (meta: SongMetadata) => {
      setAppState('ANALYZING');
      setErrorMsg('');

      try {
          const analysis = await analyzeSong(meta);
          setPraiseData(analysis);
          setAppState('RESULT');
          if (analysis.isBadSong) setActiveTab('hype');
      } catch (err) {
          console.error("Analysis Error:", err);
          const msg = err instanceof Error ? err.message : "KwaKwa 過熱了... (Server Busy)";
          setErrorMsg(msg);
          setAppState('ERROR');
      }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!songData || !praiseData || !question.trim() || isAsking) return;
    const currentQuestion = question.trim();
    setQuestion('');
    setIsAsking(true);
    setQuestionError('');
    try {
      const answer = await askAboutSong(songData, praiseData, currentQuestion, questionAnswers);
      setQuestionAnswers((previous) => [...previous, { question: currentQuestion, answer }]);
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : '回答失败，请重试。');
    } finally {
      setIsAsking(false);
    }
  };

  const handleCopyQuote = async () => {
    if (!praiseData) return;
    try {
      await navigator.clipboard.writeText(praiseData.modes[activeTab]);
      setActionNotice('当前夸歌文案已复制');
    } catch {
      setActionNotice('复制失败，请手动选择文案');
    }
  };

  const handleSaveAnalysis = () => {
    if (!songData || !praiseData) return;
    const sections: Array<[string, { publicText: string; geekText: string }]> = [
      ['文化脉络', praiseData.deepDive.culture],
      ['和声', praiseData.deepDive.harmony],
      ['节奏', praiseData.deepDive.rhythm],
      ['音色', praiseData.deepDive.timbre],
    ];
    const lines = [
      songData.title + ' — ' + songData.artist,
      '',
      praiseData.hook,
      '',
      '走心：' + praiseData.modes.emo,
      '上头：' + praiseData.modes.hype,
      '懂行：' + praiseData.modes.pro,
      '',
    ];
    for (const [title, item] of sections) {
      lines.push(title, item.publicText, item.geekText, '');
    }
    const blob = new Blob([lines.join(String.fromCharCode(10))], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = (songData.title + ' - 夸夸音乐分析.txt').replace(/[\\/:*?"<>|]/g, '_');
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setActionNotice('分析文本已下载');
  };

  const handleReset = () => {
    setAppState('HOME');
    setQuery('');
    setSongData(null);
    setPraiseData(null);
    setSearchResults([]);
    setQuestion('');
    setQuestionAnswers([]);
    setQuestionError('');
    setActionNotice('');
    setErrorMsg('');
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
        <form onSubmit={handleManualSearch} className="w-full max-w-sm relative mb-4">
            <input
            type="text"
            maxLength={300}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setErrorMsg(''); setSearchResults([]); }}
            placeholder="粘贴歌曲链接，或输入歌名 / 歌手"
            className="w-full bg-white/10 border border-white/20 rounded-full py-3 px-6 text-center text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all font-mono"
            />
            <button type="submit" className="mt-3 w-full bg-yellow-400 hover:bg-yellow-300 text-black font-black py-3 text-sm rounded-lg transition-transform active:scale-[0.98]">
              搜索歌曲
            </button>
        </form>
      )}

      {errorMsg && appState !== 'ERROR' && (
        <p role="alert" className="w-full max-w-sm text-sm text-rose-300 bg-rose-400/10 border border-rose-300/20 rounded-lg px-4 py-3 mb-4">
          {errorMsg}
        </p>
      )}

      {searchResults.length > 0 && (
        <div className="w-full max-w-xl space-y-2 mb-8 text-left">
          <div className="text-xs uppercase tracking-widest text-white/40 px-1">搜索结果 · 选择一首开始分析</div>
          {searchResults.map((song) => (
            <button
              key={song.id || song.title + song.artist}
              type="button"
              onClick={() => handleSelectSong(song)}
              className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 p-3 text-left transition-colors"
            >
              {song.coverUrl ? (
                <img src={song.coverUrl} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded bg-white/10 flex items-center justify-center text-yellow-300">♪</div>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-white">{song.title}</span>
                <span className="block truncate text-xs text-zinc-400">{song.artist}{song.album ? ' · ' + song.album : ''}</span>
              </span>
              <span className="text-xs font-bold text-yellow-300 whitespace-nowrap">分析 →</span>
            </button>
          ))}
        </div>
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
           <p className="text-white/60 mb-2 font-mono text-sm uppercase tracking-widest">{songData.artist}</p>
           <p className="text-white/75 text-sm max-w-lg leading-relaxed mb-3">{praiseData.hook}</p>
           <p className="text-white/30 text-[10px] mb-4">根据曲目信息生成解读；没有直接播放或读取音频。</p>
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

        {/* Follow-up music Q&A */}
        <section className="mb-10">
            <h3 className="text-white/80 text-lg font-bold mb-2">继续问这首歌</h3>
            <p className="text-white/40 text-xs mb-4">可以追问刚才的分析、某个乐段，或你想听懂的音乐概念。</p>
            <form onSubmit={handleAskQuestion} className="flex gap-2">
              <input
                value={question}
                maxLength={600}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="例如：副歌为什么听起来更有张力？"
                className="min-w-0 flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-400"
              />
              <button
                type="submit"
                disabled={isAsking || !question.trim()}
                className="px-4 py-3 rounded-xl bg-yellow-400 text-black font-bold text-xs disabled:opacity-50"
              >
                {isAsking ? '思考中…' : '提问'}
              </button>
            </form>
            {questionError && <p role="alert" className="text-rose-300 text-xs mt-3">{questionError}</p>}
            <div className="space-y-3 mt-4">
              {questionAnswers.map((item, index) => (
                <article key={index} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="text-yellow-200 text-sm font-bold mb-2">你：{item.question}</p>
                  <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{item.answer}</p>
                </article>
              ))}
            </div>
        </section>

        {/* Footer */}
        <div className="flex gap-4">
             <button onClick={handleCopyQuote} className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs py-4 rounded-xl font-bold uppercase tracking-wider transition-colors border border-white/5">
                复制当前夸歌文案
            </button>
            <button onClick={handleSaveAnalysis} className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black text-xs py-4 rounded-xl font-bold uppercase tracking-wider transition-colors shadow-lg shadow-yellow-400/20">
                下载分析文本
            </button>
        </div>
        {actionNotice && <p aria-live="polite" className="text-center text-xs text-white/50 mt-3">{actionNotice}</p>}
      </div>
    );
  };

  return (
    <div 
      className="min-h-screen transition-colors duration-1000 ease-in-out font-sans selection:bg-yellow-400 selection:text-black"
      style={getBackgroundStyle()}
    >
      {(appState === 'HOME' || appState === 'SEARCH_RESULTS') && renderHome()}
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
