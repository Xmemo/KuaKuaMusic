// content.js - 夸夸音乐 Multi-Platform Scraper
console.log("夸夸音乐 Content Script Loaded");

let lastSongKey = "";

function getNetEaseInfo() {
  const playbar = document.querySelector('.m-playbar');
  if (!playbar) return null;

  const titleEl = playbar.querySelector('.name');
  const artistEl = playbar.querySelector('.by');
  const imgEl = playbar.querySelector('.head img');

  if (titleEl && artistEl) {
    return {
      title: (titleEl.textContent || titleEl.innerText).trim(),
      artist: (artistEl.textContent || artistEl.innerText).replace(/^by\s*/i, '').trim(),
      coverUrl: imgEl ? imgEl.src : "",
      platform: 'NETEASE'
    };
  }
  return null;
}

function getQQMusicInfo() {
  // QQ Music Web Player (y.qq.com/n/ryqq/player)
  const titleEl = document.querySelector('#song_name a');
  const artistEl = document.querySelector('#singer_name a');
  const imgEl = document.querySelector('#song_pic');

  if (titleEl && artistEl) {
    return {
      title: titleEl.title || titleEl.innerText,
      artist: artistEl.title || artistEl.innerText,
      coverUrl: imgEl ? imgEl.src : "",
      platform: 'QQ'
    };
  }
  return null;
}

function getYouTubeMusicInfo() {
  // YT Music (music.youtube.com)
  const titleEl = document.querySelector('yt-formatted-string.title.style-scope.ytmusic-player-bar');
  const artistEl = document.querySelector('span.subtitle.style-scope.ytmusic-player-bar yt-formatted-string.byline.style-scope.ytmusic-player-bar');
  const imgEl = document.querySelector('.image.style-scope.ytmusic-player-bar');

  if (titleEl && artistEl) {
    // Artist text often contains "Artist • Album • Year", we take the first part
    let artistText = artistEl.title || artistEl.innerText;
    if (artistText.includes('•')) {
        artistText = artistText.split('•')[0].trim();
    }

    return {
      title: titleEl.title || titleEl.innerText,
      artist: artistText,
      coverUrl: imgEl ? imgEl.src : "",
      platform: 'YOUTUBE'
    };
  }
  return null;
}

function getSongInfo() {
  const host = window.location.hostname;
  
  if (host.includes('music.163.com')) {
    return getNetEaseInfo();
  } else if (host.includes('y.qq.com')) {
    return getQQMusicInfo();
  } else if (host.includes('music.youtube.com')) {
    return getYouTubeMusicInfo();
  }
  return null;
}

function checkAndNotify() {
  const song = getSongInfo();
  if (song) {
    const currentKey = `${song.title}-${song.artist}`;
    if (currentKey !== lastSongKey) {
      console.log("夸夸音乐 - New Vibe Detected:", song);
      lastSongKey = currentKey;
      
      // Send to Side Panel
      try {
        chrome.runtime.sendMessage({
            type: "SONG_CHANGE",
            payload: song
        });
      } catch (e) {
        // Extension context invalidated or side panel closed
      }
    }
  }
}

// Observe changes
const observer = new MutationObserver((mutations) => {
  checkAndNotify();
});

// Target different nodes based on platform
let targetNode = null;
if (window.location.hostname.includes('music.163.com')) {
    targetNode = document.querySelector('.m-playbar');
} else if (window.location.hostname.includes('y.qq.com')) {
    targetNode = document.querySelector('.player_music__info'); // approximate
    if (!targetNode) targetNode = document.body; 
} else if (window.location.hostname.includes('music.youtube.com')) {
    targetNode = document.querySelector('ytmusic-player-bar');
}

if (targetNode) {
  observer.observe(targetNode, { attributes: true, childList: true, subtree: true });
} else {
    // Fallback for tricky sites
    setInterval(checkAndNotify, 1000);
}

// Initial check
setTimeout(checkAndNotify, 1000);
