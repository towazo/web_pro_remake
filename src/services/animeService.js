import { translateGenre } from '../constants/animeData';

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

const ANIME_LIST_QUERY = `
  query ($search: String, $perPage: Int) {
    Page (perPage: $perPage) {
      media (search: $search, type: ANIME) {
        id
        title {
          native
          romaji
          english
        }
        coverImage {
          large
        }
        seasonYear
        episodes
        genres
      }
    }
  }
`;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchAnimeDetails = async (title) => {
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

export const searchAnimeList = async (title, perPage = 8) => {
  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: ANIME_LIST_QUERY,
        variables: { search: title, perPage }
      })
    });

    if (!response.ok) return [];

    const result = await response.json();
    return result.data?.Page?.media || [];
  } catch (error) {
    console.error(`Error searching list for ${title}:`, error);
    return [];
  }
};

export const selectFeaturedAnimes = (allAnimes) => {
  // Case 0: Tutorial / Zero State
  if (!allAnimes || allAnimes.length === 0) {
    return [
      {
        isTutorial: true,
        badge: "Welcome",
        title: "AniTriggerへようこそ",
        description: "視聴済みアニメを記録・整理し、思い出すきっかけを作るWebアプリです。\n自分だけのアーカイブを作りましょう。",
        image: "/images/logo.png",
        uniqueId: "tut-1"
      },
      {
        isTutorial: true,
        badge: "How to use",
        title: "作品を追加しよう",
        description: "画面下部の追加ボタンから、視聴したアニメ作品を追加してみましょう。",
        uniqueId: "tut-2"
      },
      {
        isTutorial: true,
        badge: "Features",
        title: "新しい発見を",
        description: "作品が増えると、ジャンルごとにランダムで「今日の一本」をスライドで表示します。\n記録が増えるほど楽しさが広がります。",
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
  const allGenres = [...new Set(allAnimes.flatMap(a => a.genres))];
  const shuffledGenres = allGenres.sort(() => 0.5 - Math.random());
  const targetGenres = shuffledGenres.slice(0, 3);

  const selected = [];
  const selectedIds = new Set();

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

  while (selected.length < 3 && selected.length < allAnimes.length) {
    const remaining = allAnimes.filter(a => !selectedIds.has(a.id));
    if (remaining.length === 0) break;

    const picked = remaining[Math.floor(Math.random() * remaining.length)];
    selected.push({
      ...picked,
      selectionReason: "おすすめ",
      uniqueId: `random-${picked.id}`
    });
    selectedIds.add(picked.id);
  }

  return selected;
};
