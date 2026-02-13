import { useState, useEffect, useMemo, useRef } from 'react';

// ============================================================================
// 1. Constants & Data
// ============================================================================

// Translation Cache Management (v2: 300 char limit)
const TRANSLATION_CACHE_KEY = 'anime_translation_cache_v2';

function getCachedTranslation(animeId) {
  try {
    const cache = JSON.parse(localStorage.getItem(TRANSLATION_CACHE_KEY) || '{}');
    return cache[animeId];
  } catch (e) {
    console.error('Failed to read translation cache:', e);
    return null;
  }
}

function setCachedTranslation(animeId, translation) {
  try {
    const cache = JSON.parse(localStorage.getItem(TRANSLATION_CACHE_KEY) || '{}');
    cache[animeId] = translation;
    localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Failed to save translation cache:', e);
  }
}

// Google Translate (unofficial) API Function
async function translateText(text, sourceLang = 'en', targetLang = 'ja') {
  try {
    // Clean HTML tags from text before translation
    let cleanText = text.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');

    // Remove common appendixes that aren't part of the synopsis
    // e.g. "(Source: ...)", "Note:", "Includes ..."
    cleanText = cleanText.replace(/\(Source:.*$/s, '').trim();
    cleanText = cleanText.replace(/\nNote:.*$/s, '').trim();

    // Truncate at a natural sentence boundary if too long (max ~500 chars)
    const MAX_CHARS = 300;
    if (cleanText.length > MAX_CHARS) {
      // Find the last sentence-ending punctuation before the limit
      const truncated = cleanText.substring(0, MAX_CHARS);
      const lastPeriod = Math.max(
        truncated.lastIndexOf('. '),
        truncated.lastIndexOf('.\n'),
        truncated.lastIndexOf('! '),
        truncated.lastIndexOf('? ')
      );
      if (lastPeriod > MAX_CHARS * 0.3) {
        cleanText = truncated.substring(0, lastPeriod + 1);
      } else {
        cleanText = truncated + '...';
      }
    }

    // Google Translate unofficial API endpoint
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }

    const data = await response.json();

    // Google returns nested arrays: [[["translated","original",...],...]...]
    if (data && data[0]) {
      const translated = data[0].map(item => item[0]).join('');
      return translated;
    }
    throw new Error('Translation failed: Invalid response format');
  } catch (error) {
    console.error('Translation failed:', error);
    return null;
  }
}


const WATCHED_TITLES = [
  "鬼滅の刃",
  "ちはやふる",
  "コードギアス 反逆のルルーシュ",
  "化物語",
  "STEINS;GATE",
  "ヴァイオレット・エヴァーガーデン",
  "進撃の巨人",
  "SPY×FAMILY",
  "呪術廻戦",
  "新世紀エヴァンゲリオン",
  "ソードアート・オンライン",
  "魔法少女まどか☆マギカ",
  "宇宙よりも遠い場所",
  "四月は君の嘘",
  "ハイキュー!!",
  "僕のヒーローアカデミア",
  "推しの子",
  "葬送のフリーレン",
  "リコリス・リコイル",
  "ぼっち・ざ・ろっく！",
];

const ANIME_DESCRIPTIONS = {
  "鬼滅の刃": "時は大正、日本。炭を売る心優しき少年・炭治郎は、ある日鬼に家族を皆殺しにされてしまう。さらに唯一生き残った妹の禰豆子は鬼に変貌してしまった。絶望的な現実に打ちのめされる炭治郎だったが、妹を人間に戻し、家族を殺した鬼を討つため、「鬼殺隊」の道を進む決意をする。",
  "ちはやふる": "「競技かるた」に懸ける高校生たちの青春を描く物語。小学6年生の千早は、転校生の新に出会い、かるたの魅力に引き込まれる。高校生になった千早は、幼馴染の太一とともに「競技かるた部」を設立し、全国大会を目指して仲間と共に成長していく。",
  "コードギアス 反逆のルルーシュ": "皇暦2010年、神聖ブリタニア帝国に占領された日本。ブリタニアの皇子でありながら国を憎むルルーシュは、謎の少女C.C.から絶対遵守の力「ギアス」を授かる。仮面の男「ゼロ」となり、黒の騎士団を率いて、世界を壊し世界を創るための反逆を開始する。",
  "化物語": "高校3年生の阿良々木暦は、春休みに吸血鬼と遭遇したことで「怪異」に関わる体質となってしまう。ある日、彼は同級生の戦場ヶ原ひたぎの抱える「重さがない」という秘密を知り、彼女を助けるために奔走する。様々な少女たちと怪異を巡る不思議な物語。",
  "STEINS;GATE": "秋葉原を拠点とする小さな発明サークル「未来ガジェット研究所」。リーダーの岡部倫太郎は、偶然にも過去へとメールを送れる「タイムマシン」を発明してしまう。興味本位で過去への干渉を繰り返すうち、彼は世界規模の大事件と悲劇的な運命に巻き込まれていく。",
  "ヴァイオレット・エヴァーガーデン": "「愛してる」の意味を知るために。戦場で「兵器」として育てられた少女ヴァイオレットは、戦争が終わり、手紙を代筆する「自動手記人形」としての仕事を始める。様々な依頼主の想いに触れる中で、彼女は少しずつ人間の感情と言葉の意味を理解していく。",
  "進撃の巨人": "巨人がすべてを支配する世界。巨人の餌と化した人類は、巨大な壁を築き、壁外への自由と引き換えに侵略を防いでいた。だが名ばかりの平和は、超大型巨人の出現により壁とともに崩れ去る。少年エレンは母を殺した巨人を駆逐するため、調査兵団に入団し過酷な戦いに挑む。",
  "SPY×FAMILY": "凄腕スパイの<黄昏>は、より良き世界のため、ある極秘任務を課せられる。それは、精神科医ロイド・フォージャーに扮し、偽りの家族を作ること。しかし、娘・アーニャは超能力者、妻・ヨルは殺し屋だった！互いに正体を隠した仮初めの家族が、受験と世界の危機に立ち向かう痛快コメディ。",
  "呪術廻戦": "驚異的な身体能力を持つ高校生・虎杖悠仁は、呪いに襲われた仲間を救うため、特級呪物「両面宿儺の指」を喰らい、己の魂に呪いを宿してしまう。最強の呪術師・五条悟の案内で「東京都立呪術高等専門学校」に入学した虎杖は、呪いを祓うべく、壮絶な戦いの世界へと足を踏み入れる。",
  "新世紀エヴァンゲリオン": "未曾有の大災害「セカンドインパクト」後の世界。第3新東京市に襲来する謎の敵「使徒」に対抗できるのは、汎用人型決戦兵器エヴァンゲリオンのみだった。父に呼び出された14歳の少年・碇シンジは、EVA初号機のパイロットとして、世界の命運を背負い戦うことになる。",
  "ソードアート・オンライン": "次世代VRMMORPG「ソードアート・オンライン」にログインしたキリトは、開発者から恐るべき真実を告げられる。それは、ゲーム内での死が現実世界での死を意味するデスゲームだった。キリトはログアウト不可の仮想世界で生き残るため、最上層の第100層を目指して戦い続ける。",
  "魔法少女まどか☆マギカ": "見滝原中学校に通う普通の中学2年生・鹿目まどかは、不思議な生き物キュゥべえと出会い、魔法少女になる契約を迫られる。だが、その傍らには魔法少女として戦う転校生・暁美ほむらの姿があった。願いを叶えた代償として背負う、魔法少女たちの過酷な運命を描く。",
  "宇宙よりも遠い場所": "「南極」を目指す女子高生たちの青春グラフィティ。何かを成し遂げたいと思いながらも一歩を踏み出せない玉木マリ（キマリ）は、南極に行くことを夢見る小淵沢報瀬と出会う。周囲に無謀だと笑われても諦めない彼女の姿に心を動かされ、少女たちは「宇宙よりも遠い場所」を目指す旅に出る。",
  "四月は君の嘘": "母の死をきっかけにピアノが弾けなくなった元天才少年・有馬公生。モノクロームだった彼の日常は、天真爛漫なヴァイオリニスト・宮園かをりとの出会いによって色付き始める。彼女の強引な誘いで再び音楽と向き合う公生だったが、彼女にはある秘密があった。",
  "ハイキュー!!": "ふとしたきっかけでバレーボールに魅せられた少年・日向翔陽。「コート上の王様」影山飛雄に惨敗した中学時代のリベンジを誓い、烏野高校バレー部に入部するが、そこにはなんと影山の姿が。反目しあう二人が、コンビネーションを武器に全国大会を目指す。",
  "僕のヒーローアカデミア": "総人口の約8割が何らかの超常能力「個性」を持つ世界。「無個性」で生まれた少年・緑谷出久は、ヒーローになる夢を諦めきれずにいた。憧れのNo.1ヒーロー・オールマイトに見出され、個性を継承した彼は、ヒーロー輩出の名門・雄英高校で最高のヒーローを目指す。",
  "推しの子": "地方都市で働く産婦人科医・ゴローの前に現れたのは、彼の「推し」アイドル・星野アイだった。彼女の妊娠・出産という秘密を守り抜こうとするゴローだったが、何者かに殺害されてしまう。目が覚めると、彼はアイの双子の息子・アクアとして転生していた。芸能界の光と闇を描く衝撃作。",
  "葬送のフリーレン": "魔王を倒した勇者一行の後日譚。エルフの魔法使いフリーレンは、長命ゆえに仲間の老いと死を見送ることになる。「人を知る」ための旅に出た彼女は、新たな仲間と共に、かつての冒険の足跡を辿りながら、かけがえのない思い出と向き合っていく。",
  "リコリス・リコイル": "犯罪を未然に防ぐ秘密組織「DA」。そのエージェントである少女たち「リコリス」。歴代最強のリコリスと称される千束と、優秀だがワケありのたきなは、喫茶「リコリコ」で働きながら様々な依頼をこなしていく。凸凹コンビの日常とガンアクション。",
  "ぼっち・ざ・ろっく！": "極度の人見知りで陰キャな少女・後藤ひとりは、バンド活動に憧れてギターを始めるが、友達がいないため一人で練習する毎日。ある日、「結束バンド」に誘われたことで彼女の日常は一変する。コミュ障ながらも音楽を通じて成長していくバンドストーリー。"
};

const GENRE_TRANSLATIONS = {
  "Action": "アクション",
  "Adventure": "冒険",
  "Comedy": "コメディ",
  "Drama": "ドラマ",
  "Ecchi": "お色気",
  "Fantasy": "ファンタジー",
  "Horror": "ホラー",
  "Mahou Shoujo": "魔法少女",
  "Mecha": "メカ",
  "Music": "音楽",
  "Mystery": "ミステリー",
  "Psychological": "サイコ",
  "Romance": "恋愛",
  "Sci-Fi": "SF",
  "Slice of Life": "日常",
  "Sports": "スポーツ",
  "Supernatural": "超常現象",
  "Thriller": "サスペンス"
};

const translateGenre = (genre) => GENRE_TRANSLATIONS[genre] || genre;

// ============================================================================
// 2. API Helper Functions
// ============================================================================

const ANIME_QUERY = `
  query ($search: String) {
    Media (search: $search, type: ANIME) {
      id
      title {
        native
        romaji
        english
      }
      coverImage {
        extraLarge
        large
      }
      seasonYear
      episodes
      genres
      bannerImage
      description
    }
  }
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchAnimeDetails = async (title) => {
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: ANIME_QUERY,
        variables: { search: title }
      })
    });

    if (!response.ok) return null;

    const result = await response.json();
    return result.data?.Media;
  } catch (error) {
    console.error(`Error fetching ${title}:`, error);
    return null;
  }
};

// ============================================================================
// 3. Components
// ============================================================================

function LoadingOverlay({ loaded, total }) {
  return (
    <div className="loading-bar-container">
      <div className="loading-text">
        作品データを取得中... {loaded} / {total}
      </div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${(loaded / total) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Hero({ anime, isActive }) {
  const [translatedDesc, setTranslatedDesc] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);

  if (!anime) return null;

  // Use a different structure if it's a tutorial slide
  if (anime.isTutorial) {
    return (
      <section className={`hero ${isActive ? 'active' : ''} hero-slide`}>
        <div className="hero-content" style={{ textAlign: 'center', alignItems: 'center' }}>
          <span className="badge" style={{ backgroundColor: '#aaa' }}>{anime.badge}</span>
          <h1>{anime.title}</h1>
          <div className="hero-desc" style={{ maxWidth: '600px', margin: '20px auto' }}>
            {anime.description}
          </div>
          {anime.image && <img src={anime.image} alt="Tutorial" style={{ height: '100px', margin: '20px' }} />}
        </div>
      </section>
    );
  }

  // Effect to handle translation
  useEffect(() => {
    if (!anime || anime.isTutorial) return;

    async function loadDescription() {
      // Step 1: Check ANIME_DESCRIPTIONS dictionary
      let localDesc = null;

      if (anime.title?.native) {
        localDesc = ANIME_DESCRIPTIONS[anime.title.native];
      }
      if (!localDesc && anime.title?.romaji) {
        localDesc = ANIME_DESCRIPTIONS[anime.title.romaji];
      }
      if (!localDesc && anime.title?.english) {
        localDesc = ANIME_DESCRIPTIONS[anime.title.english];
      }

      // If found in dictionary, use it
      if (localDesc) {
        setTranslatedDesc(localDesc);
        return;
      }

      // Step 2: Check cache
      const animeId = anime.id || anime.title?.romaji || anime.title?.native;
      const cached = getCachedTranslation(animeId);
      if (cached) {
        setTranslatedDesc(cached);
        return;
      }

      // Step 3: If we have English description, translate it
      if (anime.description) {
        setIsTranslating(true);
        const translated = await translateText(anime.description);

        if (translated) {
          setTranslatedDesc(translated);
          setCachedTranslation(animeId, translated);
        } else {
          // Translation failed, use English
          setTranslatedDesc(null);
        }
        setIsTranslating(false);
      }
    }

    loadDescription();
  }, [anime]);

  // Determine final description to display
  const description = translatedDesc || anime.description || '詳細情報がありません。';
  const showTranslateLink = !translatedDesc && anime.description && !isTranslating;

  // Background Image logic
  const bgImage = anime.bannerImage || (anime.coverImage && (anime.coverImage.extraLarge || anime.coverImage.large)) || '';
  const heroStyle = bgImage ? {
    backgroundImage: `url(${bgImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    position: 'relative'
  } : {};

  return (
    <section className={`hero ${isActive ? 'active' : ''} hero-slide`} style={heroStyle}>
      {/* Overlay for readability */}
      <div className="hero-overlay"></div>

      <div className="hero-content">
        {anime.selectionReason ? (
          <div className="selection-reason-badge">
            {anime.selectionReason}
          </div>
        ) : (
          <span className="badge">今日の一本</span>
        )}
        <h1>{anime.title ? (anime.title.native || anime.title.romaji) : 'No Title'}</h1>
        <div className="hero-meta">
          <span>{anime.seasonYear || '不明'}</span>
          <span className="dot">•</span>
          <span>{anime.genres ? anime.genres.slice(0, 3).map(translateGenre).join(' / ') : ''}</span>
          <span className="dot">•</span>
          <span>{anime.episodes || '?'} 話</span>
        </div>

        {isTranslating ? (
          <p className="hero-desc" style={{ fontStyle: 'italic', opacity: 0.7 }}>
            翻訳中...
          </p>
        ) : (
          <p className="hero-desc" dangerouslySetInnerHTML={{ __html: description }} />
        )}

        {showTranslateLink && (
          <div className="hero-actions">
            <span style={{ fontSize: '0.9rem', color: '#666' }}>
              ⚠️ 自動翻訳に失敗しました
            </span>
          </div>
        )}
      </div>
    </section>
  );
}


function HeroSlider({ slides }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Reset index when slides change
  useEffect(() => {
    setCurrentIndex(0);
  }, [slides]);

  if (!slides || slides.length === 0) return null;

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  return (
    <div className="hero-slider-container">
      {slides.map((slide, index) => (
        <Hero
          key={slide.uniqueId || slide.id || index}
          anime={slide}
          isActive={index === currentIndex}
        />
      ))}

      {slides.length > 1 && (
        <>
          <button className="slider-nav-button slider-prev" onClick={prevSlide}>
            &#8249;
          </button>
          <button className="slider-nav-button slider-next" onClick={nextSlide}>
            &#8250;
          </button>
          <div className="slider-indicators">
            {slides.map((_, index) => (
              <button
                key={index}
                className={`slider-dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AnimeCard({ anime, onRemove }) {
  return (
    <div className="anime-card">
      <div className="card-image-wrapper">
        <img
          src={anime.coverImage.large}
          alt={anime.title.native}
          loading="lazy"
        />
        <div className="episodes-badge">{anime.episodes || '?'} 話</div>
        <button
          className="delete-button"
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`「${anime.title.native || anime.title.romaji}」を削除しますか？`)) {
              onRemove(anime.id);
            }
          }}
          title="削除"
        >
          🗑️
        </button>
      </div>
      <div className="card-info">
        <h3>{anime.title.native || anime.title.romaji}</h3>
        <div className="card-meta">
          <span className="year">{anime.seasonYear || '不明'}</span>
        </div>
        <div className="card-genres">
          {anime.genres.slice(0, 2).map(g => (
            <span key={g} className="genre-tag">{translateGenre(g)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 4. Logic Functions
// ============================================================================

const selectFeaturedAnimes = (allAnimes) => {
  // Case 0: Tutorial / Zero State
  if (!allAnimes || allAnimes.length === 0) {
    return [
      {
        isTutorial: true,
        badge: "Welcome",
        title: "AniTriggerへようこそ",
        description: "視聴済みアニメを記録・整理し、思い出すきっかけを作るWebアプリです。自分だけのアーカイブを作りましょう。",
        image: "/images/logo.png",
        uniqueId: "tut-1"
      },
      {
        isTutorial: true,
        badge: "How to use",
        title: "作品を追加しよう",
        description: "画面下部の入力フォームから、好きなアニメのタイトルを入力して追加ボタンを押してください。",
        uniqueId: "tut-2"
      },
      {
        isTutorial: true,
        badge: "Features",
        title: "新しい発見を",
        description: "作品が増えると、ジャンルごとにランダムで「今日の一本」を提案します。記録が増えるほど楽しさが広がります。",
        uniqueId: "tut-3"
      }
    ];
  }

  // Case 1: Few items, show all
  if (allAnimes.length <= 2) {
    return allAnimes.map(a => ({
      ...a,
      selectionReason: "コレクション",
      uniqueId: `all-${a.id}`
    }));
  }

  // Case 2: Many items, pick random via genres
  // 1. Get all unique genres
  const allGenres = [...new Set(allAnimes.flatMap(a => a.genres))];

  // 2. Shuffle genres
  const shuffledGenres = allGenres.sort(() => 0.5 - Math.random());

  // 3. Pick top 3 genres (or less if not enough)
  const targetGenres = shuffledGenres.slice(0, 3);

  const selected = [];
  const selectedIds = new Set();

  // 4. For each genre, pick a random anime NOT already selected
  targetGenres.forEach(genre => {
    const candidates = allAnimes.filter(a =>
      a.genres.includes(genre) && !selectedIds.has(a.id)
    );

    if (candidates.length > 0) {
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      selected.push({
        ...picked,
        selectionReason: `ジャンル: ${translateGenre(genre)}`,
        uniqueId: `genre-${picked.id}-${genre}`
      });
      selectedIds.add(picked.id);
    }
  });

  // 5. If we don't have 3 items yet (due to overlapping genres or few genres), fill with randoms
  while (selected.length < 3 && selected.length < allAnimes.length) {
    const remaining = allAnimes.filter(a => !selectedIds.has(a.id));
    if (remaining.length === 0) break;

    const picked = remaining[Math.floor(Math.random() * remaining.length)];
    selected.push({
      ...picked,
      selectionReason: "ランダムピックアップ",
      uniqueId: `random-${picked.id}`
    });
    selectedIds.add(picked.id);
  }

  return selected;
};

// ============================================================================
// 5. Stats Component
// ============================================================================

function StatsSection({ animeList }) {
  const stats = useMemo(() => {
    const totalWorks = animeList.length;
    const totalEpisodes = animeList.reduce((acc, curr) => acc + (curr.episodes || 0), 0);

    const genreCounts = {};
    animeList.forEach(anime => {
      anime.genres?.forEach(g => {
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });
    });

    let favoriteGenre = "なし";
    let maxCount = 0;
    Object.entries(genreCounts).forEach(([genre, count]) => {
      if (count > maxCount) {
        maxCount = count;
        favoriteGenre = genre;
      }
    });

    return { totalWorks, totalEpisodes, favoriteGenre: translateGenre(favoriteGenre) };
  }, [animeList]);

  return (
    <div className="stats-container">
      <div className="stat-card">
        <div className="stat-icon">📚</div>
        <div className="stat-info">
          <div className="stat-value">{stats.totalWorks} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>作品</span></div>
          <div className="stat-label">登録作品数</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">📺</div>
        <div className="stat-info">
          <div className="stat-value">{stats.totalEpisodes} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>話</span></div>
          <div className="stat-label">総エピソード</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">❤️</div>
        <div className="stat-info">
          <div className="stat-value">{stats.favoriteGenre}</div>
          <div className="stat-label">最愛ジャンル</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 6. Add Anime Screen Component
// ============================================================================

function AddAnimeScreen({ onAdd, onBack }) {
  const [title, setTitle] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState({ type: null, message: null });
  const [previewData, setPreviewData] = useState(null);

  // 1. Search Logic
  const handleSearch = async () => {
    if (!title.trim()) return;
    setIsSearching(true);
    setStatus({ type: null, message: null });
    setPreviewData(null);

    const data = await fetchAnimeDetails(title);

    if (data) {
      setPreviewData(data);
    } else {
      setStatus({
        type: 'error',
        message: '作品が見つかりませんでした。全角・半角、大文字・小文字、略称などを確認し、正式名称で再度検索してください。'
      });
    }
    setIsSearching(false);
  };

  // 2. Confirm & Add Logic
  const handleConfirm = () => {
    if (!previewData) return;

    const result = onAdd(previewData);
    if (result.success) {
      setStatus({
        type: 'success',
        message: '登録が完了しました。'
      });
      setTitle(""); // Clear input
      setPreviewData(null); // Clear preview to hide image
    } else {
      setStatus({
        type: 'error',
        message: result.message || 'エラーが発生しました。'
      });
    }
  };

  // 3. Cancel Logic
  const handleCancel = () => {
    setPreviewData(null);
    setStatus({ type: null, message: null });
  };

  return (
    <div className="add-screen-container">
      <div className="add-screen-header">
        <h2>作品の追加</h2>
      </div>

      {/* Show Description only if not previewing */}
      {!previewData && (
        <>
          <div className="add-description">
            <p>追加したいアニメのタイトルを入力してください。<br />
              Anilistのデータベースから検索し、最初に見つかった作品を表示します。</p>
          </div>

          <div className="search-spec">
            <h3>🔍 検索のコツ</h3>
            <p>
              ・ 正式名称での検索を推奨します（例: <code>STEINS;GATE</code>）<br />
              ・ 英語タイトルの方がヒットしやすい場合があります<br />
              ・ 略称（例: <code>リコリコ</code>）では見つからないことがあります
            </p>
          </div>
        </>
      )}

      <div className="add-form">
        {/* Input Form - Hide when previewing to focus on confirmation */}
        {!previewData && (
          <>
            <input
              type="text"
              placeholder="作品名を入力 (例: 葬送のフリーレン)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              className="action-button add-button"
              onClick={handleSearch}
              disabled={isSearching}
            >
              {isSearching ? '検索中...' : '検索する'}
            </button>
          </>
        )}

        {/* Confirmation Preview */}
        {previewData && (
          <div className="preview-card">
            <div className="preview-title">この作品で間違いないですか？</div>
            <img
              src={previewData.coverImage.large}
              alt={previewData.title.native}
              className="preview-image"
            />
            <div className="preview-meta">
              <h3>{previewData.title.native || previewData.title.romaji}</h3>
              <p>{previewData.seasonYear || '不明'}年 • {previewData.episodes || '?'}話</p>
            </div>

            <div className="button-group">
              <button
                className="action-button confirm-button"
                onClick={handleConfirm}
              >
                登録する
              </button>
              <button
                className="action-button cancel-button"
                onClick={handleCancel}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Status Message */}
        {status.message && (
          <div className={`status-message ${status.type}`}>
            {status.message}
          </div>
        )}

        {/* Back Button - Always show */}
        <button
          className="action-button back-button"
          onClick={onBack}
          style={{ marginTop: '10px' }}
        >
          一覧に戻る
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// 7. Main App Component
// ============================================================================

function App() {
  // Initialize state from localStorage if available
  const [animeList, setAnimeList] = useState(() => {
    const saved = localStorage.getItem('myAnimeList');
    return saved ? JSON.parse(saved) : [];
  });

  const [loadingStatus, setLoadingStatus] = useState({ loaded: 0, total: WATCHED_TITLES.length, active: false });
  const [view, setView] = useState('home'); // 'home' or 'add'

  // State for the slider slides
  const [featuredSlides, setFeaturedSlides] = useState([]);

  const [error, setError] = useState(null);
  const ignoreFetch = useRef(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");

  // Persist to localStorage whenever animeList changes
  useEffect(() => {
    if (animeList.length > 0) {
      localStorage.setItem('myAnimeList', JSON.stringify(animeList));
    }
  }, [animeList]);

  // Update featured slides whenever animeList changes
  useEffect(() => {
    const slides = selectFeaturedAnimes(animeList);
    setFeaturedSlides(slides);
  }, [animeList]);

  // Initial Data Fetching
  useEffect(() => {
    // If we already have data (from localStorage), don't fetch initial list
    if (animeList.length > 0) {
      return;
    }

    if (ignoreFetch.current) return;
    ignoreFetch.current = true;

    const loadAllAnime = async () => {
      setLoadingStatus(prev => ({ ...prev, active: true }));
      const results = [];
      let failureCount = 0;

      for (let i = 0; i < WATCHED_TITLES.length; i++) {
        const title = WATCHED_TITLES[i];
        setLoadingStatus(prev => ({ ...prev, loaded: i + 1 }));

        // Fetch
        const data = await fetchAnimeDetails(title);

        if (data) {
          // Attach local description using the search key
          data.localDescription = ANIME_DESCRIPTIONS[title];
          results.push(data);
        } else {
          failureCount++;
          if (failureCount > 3 && results.length === 0) {
            setError("データの取得に失敗しました。APIのレート制限（アクセス過多）の可能性があります。1分ほど待ってからリロードしてください。");
            break;
          }
        }

        // Delay to respect API limits (800ms)
        await sleep(800);
      }

      setAnimeList(results);
      setLoadingStatus(prev => ({ ...prev, active: false }));

      if (results.length === 0 && !error) {
        if (failureCount === WATCHED_TITLES.length) {
          setError("作品データが見つかりませんでした。通信環境を確認するか、しばらく待ってから再試行してください。");
        }
      }
    };

    loadAllAnime();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddAnime = (data) => {
    if (animeList.some(a => a.id === data.id)) {
      return { success: false, message: 'その作品は既に追加されています。' };
    }
    setAnimeList(prev => [data, ...prev]);
    return { success: true };
  };

  const handleRemoveAnime = (id) => {
    setAnimeList(prev => {
      const updated = prev.filter(anime => anime.id !== id);
      if (updated.length === 0) {
        localStorage.removeItem('myAnimeList');
      }
      return updated;
    });
  };

  // Derived state for genres
  const uniqueGenres = useMemo(() => {
    const genres = new Set();
    animeList.forEach(anime => {
      anime.genres?.forEach(g => genres.add(g));
    });
    return ["All", ...Array.from(genres).sort()];
  }, [animeList]);

  // Derived state for filtered list
  const filteredList = useMemo(() => {
    return animeList.filter(anime => {
      const titleNative = anime.title.native || "";
      const titleRomaji = anime.title.romaji || "";
      const searchLower = searchQuery.toLowerCase();

      const matchesSearch =
        titleNative.toLowerCase().includes(searchLower) ||
        titleRomaji.toLowerCase().includes(searchLower);

      const matchesGenre = selectedGenre === "All" || anime.genres.includes(selectedGenre);

      return matchesSearch && matchesGenre;
    });
  }, [animeList, searchQuery, selectedGenre]);

  return (
    <div className="app-container">
      {/* Loading Overlay */}
      {loadingStatus.active && !error && (
        <LoadingOverlay loaded={loadingStatus.loaded} total={loadingStatus.total} />
      )}

      {/* Error Message */}
      {error && (
        <div className="error-banner" style={{
          position: 'fixed', bottom: '20px', left: '20px', right: '20px',
          background: 'rgba(239, 68, 68, 0.9)', color: 'white', padding: '1rem',
          borderRadius: '12px', zIndex: 2000, textAlign: 'center', backdropFilter: 'blur(10px)'
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="logo" onClick={() => setView('home')} style={{ cursor: 'pointer' }}>
          <img src="/images/logo.png" alt="AniTrigger" style={{ height: '120px' }} />
        </div>
      </header>

      {/* Conditional Rendering based on View */}
      {view === 'add' ? (
        <main className="main-content">
          <AddAnimeScreen
            onAdd={handleAddAnime}
            onBack={() => setView('home')}
          />
        </main>
      ) : (
        <>
          {/* Featured Slider Section */}
          <HeroSlider slides={featuredSlides} />

          {/* Main Content */}
          <main className="main-content">

            {/* Statistics Section */}
            <StatsSection animeList={animeList} />

            <div className="controls">
              <div className="search-box">
                <i className="search-icon">🔍</i>
                <input
                  type="text"
                  placeholder="タイトルを検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="filter-box">
                <select
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                >
                  <option value="All">すべてのジャンル</option>
                  {uniqueGenres.filter(g => g !== "All").map(genre => (
                    <option key={genre} value={genre}>{translateGenre(genre)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Add Button Area */}
            <button className="fab-add-button" onClick={() => setView('add')}>
              ➕ 新しい作品を追加する
            </button>

            <div className="results-count">
              {filteredList.length} 作品が見つかりました
            </div>

            <div className="anime-grid">
              {filteredList.map(anime => (
                <AnimeCard key={anime.id} anime={anime} onRemove={handleRemoveAnime} />
              ))}
            </div>

            {filteredList.length === 0 && !loadingStatus.active && (
              <div className="empty-state">該当する作品がありません</div>
            )}
          </main>
        </>
      )}

      <footer className="app-footer">
        <p>AniTrigger &copy; 2025 - Data provided by AniList API</p>
      </footer>
    </div>
  );
}

export default App;