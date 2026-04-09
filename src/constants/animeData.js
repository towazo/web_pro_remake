import { getSafeLocalStorage } from '../utils/browserStorage';

export const ANIME_DESCRIPTIONS = {};

const DYNAMIC_TAG_TRANSLATIONS_STORAGE_KEY = 'anime_dynamic_tag_translations_v1';

const readDynamicTagTranslations = () => {
    const storage = getSafeLocalStorage();
    if (!storage) return {};

    try {
        const raw = storage.getItem(DYNAMIC_TAG_TRANSLATIONS_STORAGE_KEY);
        const parsed = JSON.parse(raw || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed).filter(([key, value]) => (
                String(key || '').trim().length > 0
                && typeof value === 'string'
                && value.trim().length > 0
            ))
        );
    } catch (error) {
        console.error('Failed to read dynamic tag translations:', error);
        return {};
    }
};

let dynamicTagTranslations = readDynamicTagTranslations();
let tagTranslationVersion = 0;
const tagTranslationListeners = new Set();

const notifyTagTranslationListeners = () => {
    tagTranslationVersion += 1;
    tagTranslationListeners.forEach((listener) => {
        try {
            listener(tagTranslationVersion);
        } catch (_) {
            // ignore subscriber errors
        }
    });
};

const persistDynamicTagTranslations = () => {
    const storage = getSafeLocalStorage();
    if (!storage) return;

    try {
        storage.setItem(
            DYNAMIC_TAG_TRANSLATIONS_STORAGE_KEY,
            JSON.stringify(dynamicTagTranslations)
        );
    } catch (error) {
        console.error('Failed to persist dynamic tag translations:', error);
    }
};

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

export const TAG_TRANSLATIONS = {
    "Achronological Order": "時系列シャッフル",
    "Age Gap": "年の差",
    "Ancient China": "古代中国",
    "Angels": "天使",
    "Alternate Universe": "パラレル世界",
    "Badminton": "バドミントン",
    "Battle Royale": "生存競争",
    "CGI": "CG",
    "Classical Music": "クラシック音楽",
    "Coming of Age": "成長物語",
    "Cosmic Horror": "宇宙的ホラー",
    "Crime": "犯罪",
    "Cult": "カルト",
    "Curses": "呪い・呪術",
    "Cute Girls Doing Cute Things": "日常系女子",
    "Death Game": "デスゲーム",
    "Delinquents": "不良",
    "Demons": "悪魔",
    "Drugs": "薬物",
    "Ensemble Cast": "群像劇",
    "Exorcism": "除霊・祓魔",
    "Family Life": "家族",
    "Female Protagonist": "女主人公",
    "Fishing": "釣り",
    "Football": "フットボール",
    "Foreign": "海外",
    "Found Family": "家族のような絆",
    "Gambling": "ギャンブル",
    "Gore": "流血描写",
    "Ice Skating": "アイススケート",
    "Isekai": "異世界",
    "LGBTQ+ Themes": "ジェンダー・多様性",
    "Love Triangle": "三角関係",
    "Magic": "魔法",
    "Male Protagonist": "男性主人公",
    "Martial Arts": "格闘・武術",
    "Mermaid": "人魚",
    "MILF": "年上ヒロイン",
    "Military": "軍事",
    "Mixed Gender Harem": "男女混合ハーレム",
    "Modeling": "モデル",
    "Monster Boy": "人外男子",
    "Monster Girl": "人外少女",
    "Mythology": "神話",
    "Office Lady": "OL",
    "Otaku Culture": "オタク文化",
    "Philosophy": "思想・テーマ性重視",
    "Primarily Adult Cast": "大人中心",
    "Primarily Child Cast": "子ども中心",
    "Primarily Female Cast": "女性キャラ中心",
    "Primarily Male Cast": "男性キャラ中心",
    "Primarily Teen Cast": "10代キャラ中心",
    "Reincarnation": "転生",
    "Rotoscoping": "実写風アニメ",
    "School": "学園",
    "School Club": "部活",
    "Shapeshifting": "変身",
    "Shounen": "少年向け",
    "Super Power": "能力バトル",
    "Survival": "サバイバル",
    "Swordplay": "剣戟アクション",
    "Time Travel": "時間移動",
    "Tragedy": "悲劇",
    "Urban": "現代都市",
    "Urban Fantasy": "現代ファンタジー",
    "Video Games": "ゲーム",
    "Villainess": "悪役令嬢"
};

export const translateGenre = (genre) => GENRE_TRANSLATIONS[genre] || genre;

const TAG_WORD_TRANSLATIONS = {
    achronological: "時系列シャッフル",
    age: "年齢",
    ancient: "古代",
    angel: "天使",
    angels: "天使",
    badminton: "バドミントン",
    battle: "バトル",
    boy: "男子",
    cast: "キャラ",
    china: "中国",
    classical: "クラシック",
    comedy: "コメディ",
    coming: "成長",
    cosmic: "宇宙的",
    cult: "カルト",
    curse: "呪い",
    curses: "呪い",
    death: "デス",
    demons: "悪魔",
    drugs: "薬物",
    ensemble: "群像",
    exorcism: "祓魔",
    family: "家族",
    fishing: "釣り",
    football: "フットボール",
    game: "ゲーム",
    gender: "男女",
    girl: "少女",
    girls: "女子",
    gore: "流血",
    harem: "ハーレム",
    horror: "ホラー",
    ice: "アイス",
    magic: "魔法",
    male: "男性",
    martial: "武術",
    mermaid: "人魚",
    milf: "年上ヒロイン",
    mixed: "混合",
    model: "モデル",
    modeling: "モデル",
    music: "音楽",
    order: "順",
    philosophy: "思想",
    power: "能力",
    primarily: "中心",
    protagonist: "主人公",
    royale: "ロワイアル",
    rotoscoping: "実写風",
    school: "学園",
    skating: "スケート",
    super: "超",
    survival: "サバイバル",
    swordplay: "剣戟",
    teen: "10代",
    time: "時間",
    travel: "移動",
    urban: "都市",
};

export const translateTagFallback = (tag) => {
    const normalizedTag = String(tag || '').trim();
    if (!normalizedTag || !/[A-Za-z]/.test(normalizedTag)) return normalizedTag;

    const tokens = normalizedTag
        .split(/\s+/)
        .map((token) => token.replace(/^[^A-Za-z0-9+]+|[^A-Za-z0-9+]+$/g, ''))
        .filter(Boolean);

    if (tokens.length === 0) return normalizedTag;

    const translatedTokens = tokens.map((token) => TAG_WORD_TRANSLATIONS[token.toLowerCase()]);
    if (translatedTokens.some((token) => !token)) return normalizedTag;

    return translatedTokens.join('・');
};

export const getStaticTagTranslation = (tag) => {
    const normalizedTag = String(tag || '').trim();
    return normalizedTag ? (TAG_TRANSLATIONS[normalizedTag] || '') : '';
};

export const getDynamicTagTranslation = (tag) => {
    const normalizedTag = String(tag || '').trim();
    return normalizedTag ? (dynamicTagTranslations[normalizedTag] || '') : '';
};

export const mergeDynamicTagTranslations = (entries) => {
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return;

    let changed = false;
    const nextEntries = { ...dynamicTagTranslations };

    Object.entries(entries).forEach(([key, value]) => {
        const normalizedKey = String(key || '').trim();
        const normalizedValue = String(value || '').trim();
        if (!normalizedKey || !normalizedValue) return;
        if (TAG_TRANSLATIONS[normalizedKey]) return;
        if (nextEntries[normalizedKey] === normalizedValue) return;
        nextEntries[normalizedKey] = normalizedValue;
        changed = true;
    });

    if (!changed) return;

    dynamicTagTranslations = nextEntries;
    persistDynamicTagTranslations();
    notifyTagTranslationListeners();
};

export const subscribeTagTranslationUpdates = (listener) => {
    if (typeof listener !== 'function') return () => {};
    tagTranslationListeners.add(listener);
    return () => {
        tagTranslationListeners.delete(listener);
    };
};

export const getTagTranslationVersion = () => tagTranslationVersion;

export const translateTag = (tag) => (
    getStaticTagTranslation(tag)
    || getDynamicTagTranslation(tag)
    || translateTagFallback(tag)
    || tag
);
