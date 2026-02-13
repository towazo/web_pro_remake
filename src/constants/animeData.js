export const WATCHED_TITLES = [];

export const ANIME_DESCRIPTIONS = {};

export const GENRE_TRANSLATIONS = {
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

export const translateGenre = (genre) => GENRE_TRANSLATIONS[genre] || genre;
