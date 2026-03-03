import { useEffect, useMemo, useRef, useState } from 'react';
import AnimeCard from '../Cards/AnimeCard';
import AnimeFilterPanel from '../Shared/AnimeFilterPanel';
import {
  buildFilteredAnimeList,
  buildShareText,
  normalizeAnimeRating,
  normalizeMinRatingFilter,
  resolveAnimeTitle,
  SHARE_IMAGE_MAX_PAGES,
  SHARE_IMAGE_PAGE_SIZE,
  SHARE_IMAGE_SELECTION_LIMIT,
} from '../../utils/animeList';
import { translateGenre } from '../../constants/animeData';
import { joinApiPath } from '../../services/apiBase';

const SORT_OPTIONS = [
  { value: 'added', label: '追加順' },
  { value: 'title', label: 'タイトル順' },
  { value: 'year', label: '放送年順' },
  { value: 'rating', label: '評価順' },
];

const SHARE_IMAGE_WIDTH = 1800;
const SHARE_IMAGE_HEIGHT = 2100;
const SHARE_IMAGE_RENDER_SCALE = 2;
const SHARE_IMAGE_PADDING = 72;
const SHARE_IMAGE_HEADER_HEIGHT = 180;
const SHARE_IMAGE_FOOTER_HEIGHT = 64;
const SHARE_IMAGE_GRID_GAP = 28;
const SHARE_IMAGE_GRID_COLUMNS = 3;
const SHARE_IMAGE_GRID_ROWS = 2;
const SHARE_LOGO_PATH = '/images/logo.png';
const DIRECT_SHARE_IMAGE_LOAD_OPTIONS = {
  crossOrigin: 'anonymous',
  referrerPolicy: 'no-referrer',
};
let shareLogoPromise = null;

const copyTextToClipboard = async (text) => {
  const hasClipboardApi = typeof navigator !== 'undefined'
    && typeof window !== 'undefined'
    && window.isSecureContext
    && typeof navigator?.clipboard?.writeText === 'function';
  if (hasClipboardApi) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('clipboard_unavailable');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-1000px';
  textarea.style.left = '-1000px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('copy_failed');
  }
};

const chunkArray = (items, chunkSize) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const canvasToBlob = (canvas, type = 'image/png') => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error('image_blob_failed'));
      return;
    }
    resolve(blob);
  }, type);
});

const loadImageElement = (sourceUrl, options = {}) => new Promise((resolve, reject) => {
  const image = new Image();
  if (options.crossOrigin) {
    image.crossOrigin = options.crossOrigin;
  }
  if (options.referrerPolicy) {
    image.referrerPolicy = options.referrerPolicy;
  }
  image.decoding = 'async';
  image.onload = () => {
    const decodePromise = typeof image.decode === 'function'
      ? image.decode().catch(() => undefined)
      : Promise.resolve();
    decodePromise.finally(() => resolve(image));
  };
  image.onerror = () => {
    reject(new Error('image_decode_failed'));
  };
  image.src = sourceUrl;
});

const fetchImageBlobUrl = async (sourceUrl) => {
  const proxyUrl = buildShareImageProxyUrl(sourceUrl);
  if (!proxyUrl) {
    throw new Error('share_image_proxy_url_missing');
  }

  const response = await fetch(proxyUrl, {
    method: 'GET',
    cache: 'force-cache',
  });

  if (!response.ok) {
    throw new Error(`share_image_proxy_failed_${response.status}`);
  }

  const blob = await response.blob();
  if (!blob || blob.size === 0) {
    throw new Error('share_image_proxy_empty_blob');
  }

  return URL.createObjectURL(blob);
};

const buildShareImageProxyUrl = (sourceUrl) => {
  const normalizedSource = String(sourceUrl || '').trim();
  if (!normalizedSource) return '';
  return `${joinApiPath('/share-image-proxy')}?url=${encodeURIComponent(normalizedSource)}`;
};

const loadShareLogoAsset = () => {
  if (!shareLogoPromise) {
    shareLogoPromise = loadImageElement(SHARE_LOGO_PATH);
  }
  return shareLogoPromise;
};

const resolveShareCoverImageUrl = (anime) => {
  const candidates = [
    anime?.coverImage?.large,
    anime?.coverImage?.extraLarge,
    anime?.coverImage?.medium,
  ];
  return candidates.find((value) => String(value || '').trim()) || '';
};

const loadRemoteImageAsset = async (sourceUrl, transport = 'auto') => {
  const normalizedSource = String(sourceUrl || '').trim();
  if (!normalizedSource) return null;

  if (transport !== 'direct') {
    const proxyUrl = buildShareImageProxyUrl(normalizedSource);
    if (proxyUrl) {
      try {
        return await loadImageElement(proxyUrl);
      } catch (proxyImageError) {
        console.warn('[share-image] proxy image element load failed', normalizedSource, proxyImageError);
      }
    }

    try {
      const objectUrl = await fetchImageBlobUrl(normalizedSource);
      try {
        const image = await loadImageElement(objectUrl);
        image.__shareObjectUrl = objectUrl;
        return image;
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        console.error('[share-image] failed to decode proxied blob image', normalizedSource, error);
        throw error;
      }
    } catch (proxyError) {
      console.warn('[share-image] proxy blob load failed, falling back to direct url', normalizedSource, proxyError);
    }
  }

  try {
    return await loadImageElement(normalizedSource, DIRECT_SHARE_IMAGE_LOAD_OPTIONS);
  } catch (directError) {
    console.error('[share-image] direct image load failed', normalizedSource, directError);
    return null;
  }
};

const closeImageAsset = (asset) => {
  if (asset?.__shareObjectUrl) {
    URL.revokeObjectURL(asset.__shareObjectUrl);
  }
  if (asset && typeof asset.close === 'function') {
    asset.close();
  }
};

const drawObjectFitCover = (context, image, x, y, width, height) => {
  const imageWidth = image.width || image.naturalWidth || width;
  const imageHeight = image.height || image.naturalHeight || height;
  if (!imageWidth || !imageHeight) return;

  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
};

const getWrappedTextLines = (context, text, maxWidth, maxLines) => {
  const safeText = String(text || '').trim();
  if (!safeText) {
    return [];
  }

  const characters = Array.from(safeText);
  const lines = [];
  let currentLine = '';

  characters.forEach((character) => {
    const nextLine = currentLine + character;
    if (context.measureText(nextLine).width <= maxWidth || currentLine.length === 0) {
      currentLine = nextLine;
      return;
    }
    lines.push(currentLine);
    currentLine = character;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, maxLines);
};

const drawWrappedText = (context, text, x, y, maxWidth, lineHeight, maxLines) => {
  const visibleLines = getWrappedTextLines(context, text, maxWidth, maxLines);
  if (visibleLines.length === 0) return y;

  const safeText = String(text || '').trim();
  const characters = Array.from(safeText);
  const allLines = [];
  let currentLine = '';

  characters.forEach((character) => {
    const nextLine = currentLine + character;
    if (context.measureText(nextLine).width <= maxWidth || currentLine.length === 0) {
      currentLine = nextLine;
      return;
    }
    allLines.push(currentLine);
    currentLine = character;
  });

  if (currentLine) {
    allLines.push(currentLine);
  }

  const wasTrimmed = allLines.length > maxLines;
  const lastLineIndex = visibleLines.length - 1;

  visibleLines.forEach((line, index) => {
    let output = line;
    if (wasTrimmed && index === lastLineIndex) {
      while (output.length > 0 && context.measureText(`${output}…`).width > maxWidth) {
        output = output.slice(0, -1);
      }
      output = `${output}…`;
    }
    context.fillText(output, x, y + (lineHeight * index));
  });

  return y + (lineHeight * visibleLines.length);
};

const getMetaTagRows = (context, labels, maxWidth, maxRows = Number.POSITIVE_INFINITY) => {
  const safeLabels = Array.isArray(labels) ? labels.filter(Boolean) : [];
  if (safeLabels.length === 0) return 0;

  let rows = 1;
  let cursorWidth = 0;

  for (const { label } of safeLabels) {
    const tagWidth = Math.ceil(context.measureText(String(label || '').trim()).width + 28);
    const nextWidth = cursorWidth === 0 ? tagWidth : cursorWidth + 12 + tagWidth;
    if (cursorWidth > 0 && nextWidth > maxWidth) {
      if (rows >= maxRows) break;
      rows += 1;
      cursorWidth = tagWidth;
      continue;
    }
    cursorWidth = nextWidth;
  }

  return rows;
};

const drawMetaTag = (context, label, x, y, variant = 'default') => {
  const safeLabel = String(label || '').trim();
  if (!safeLabel) return 0;
  const metrics = context.measureText(safeLabel);
  const tagWidth = Math.ceil(metrics.width + 28);

  context.save();
  context.fillStyle = variant === 'year' ? '#f9f9f9' : '#ffffff';
  context.fillRect(x, y, tagWidth, 32);
  context.strokeStyle = '#111111';
  context.lineWidth = 2;
  if (variant === 'genre') {
    context.setLineDash([4, 3]);
  }
  context.strokeRect(x, y, tagWidth, 32);
  context.setLineDash([]);
  context.fillStyle = '#111111';
  context.fillText(safeLabel, x + 14, y + 22.5);
  context.restore();

  return tagWidth;
};

const drawMetaTagList = (context, labels, x, y, maxWidth, maxRows = Number.POSITIVE_INFINITY) => {
  const safeLabels = Array.isArray(labels) ? labels.filter(Boolean) : [];
  if (safeLabels.length === 0) return y;

  let cursorX = x;
  let cursorY = y;
  let row = 1;

  for (const { label, variant } of safeLabels) {
    const tagWidth = Math.ceil(context.measureText(String(label || '').trim()).width + 28);
    if (cursorX > x && cursorX + tagWidth > x + maxWidth) {
      if (row >= maxRows) break;
      row += 1;
      cursorX = x;
      cursorY += 40;
    }
    if (row > maxRows) break;
    const drawnWidth = drawMetaTag(context, label, cursorX, cursorY, variant);
    cursorX += drawnWidth + 12;
  }

  return cursorY + 32;
};

const drawRatingStars = (context, rating, x, y, width) => {
  if (rating === null) return y;

  const safeRating = Math.max(1, Math.min(5, rating));
  const buttonSize = 28;
  const buttonGap = 8;
  const startX = x;
  const buttonY = y;

  context.strokeStyle = '#eeeeee';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x, buttonY - 12);
  context.lineTo(x + width, buttonY - 12);
  context.stroke();

  context.save();
  context.font = '900 16px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (let index = 0; index < 5; index += 1) {
    const boxX = startX + (index * (buttonSize + buttonGap));
    const isActive = index < safeRating;

    context.fillStyle = isActive ? '#fff8dd' : '#ffffff';
    context.fillRect(boxX, buttonY, buttonSize, buttonSize);
    context.strokeStyle = isActive ? '#000000' : '#cfcfcf';
    context.lineWidth = 1.5;
    context.strokeRect(boxX, buttonY, buttonSize, buttonSize);

    context.fillStyle = isActive ? '#b78600' : '#b5b5b5';
    context.fillText('★', boxX + (buttonSize / 2), buttonY + (buttonSize / 2) + 0.5);
  }
  context.restore();

  return buttonY + buttonSize;
};

const buildShareImageCardLayout = (context, animePage, cardWidth, cardHeight) => {
  const infoPaddingX = 20;
  const infoWidth = cardWidth - (infoPaddingX * 2);
  const titleAreaHeight = 56;
  const titleToMetaGap = 10;
  const infoTopPadding = 32;
  const infoBottomPadding = 18;
  const hasAnyRating = animePage.some((anime) => normalizeAnimeRating(anime?.rating) !== null);
  const metaToRatingGap = hasAnyRating ? 10 : 0;

  context.save();
  context.font = '800 14px sans-serif';
  const maxMetaRows = Math.max(1, ...animePage.map((anime) => {
    const metaLabels = [];
    if (anime?.seasonYear) {
      metaLabels.push({ label: String(anime.seasonYear), variant: 'year' });
    }
    (Array.isArray(anime?.genres) ? anime.genres : [])
      .forEach((genre) => {
        const translatedGenre = translateGenre(genre);
        if (translatedGenre) {
          metaLabels.push({ label: translatedGenre, variant: 'genre' });
        }
      });
    return getMetaTagRows(context, metaLabels, infoWidth);
  }));
  context.restore();

  const metaAreaHeight = 32 + ((maxMetaRows - 1) * 40);
  const ratingAreaHeight = hasAnyRating ? 28 : 0;
  const requiredInfoHeight = infoTopPadding
    + titleAreaHeight
    + titleToMetaGap
    + metaAreaHeight
    + metaToRatingGap
    + ratingAreaHeight
    + infoBottomPadding;
  const maxAllowedCoverHeight = cardHeight - requiredInfoHeight;
  const minCoverHeight = Math.round(cardHeight * 0.46);
  const preferredCoverHeight = Math.round(cardHeight * 0.6);
  const coverHeight = maxAllowedCoverHeight >= minCoverHeight
    ? Math.min(preferredCoverHeight, maxAllowedCoverHeight)
    : maxAllowedCoverHeight;

  return {
    coverHeight,
    infoPaddingX,
    infoWidth,
    titleAreaHeight,
    titleToMetaGap,
    metaToRatingGap,
    infoTopPadding,
    infoBottomPadding,
    maxMetaRows,
  };
};

const drawImageShareCard = (context, anime, imageAsset, x, y, width, height, layout) => {
  const rating = normalizeAnimeRating(anime?.rating);
  const hasRating = rating !== null;
  const {
    coverHeight,
    infoPaddingX,
    infoWidth,
    titleAreaHeight,
    titleToMetaGap,
    metaToRatingGap,
    infoTopPadding,
    infoBottomPadding,
  } = layout;
  const titleText = resolveAnimeTitle(anime);
  const metaLabels = [];
  if (anime?.seasonYear) {
    metaLabels.push({ label: String(anime.seasonYear), variant: 'year' });
  }
  (Array.isArray(anime?.genres) ? anime.genres : [])
    .forEach((genre) => {
      const translatedGenre = translateGenre(genre);
      if (translatedGenre) {
        metaLabels.push({ label: translatedGenre, variant: 'genre' });
      }
    });

  const coverX = x;
  const coverY = y;
  const coverWidth = width;
  const infoY = coverY + coverHeight;
  const infoTop = infoY + infoTopPadding;
  const infoBottom = y + height - infoBottomPadding;

  context.fillStyle = '#ffffff';
  context.fillRect(x, y, width, height);
  context.strokeStyle = '#111111';
  context.lineWidth = 1.5;
  context.strokeRect(x, y, width, height);

  context.fillStyle = '#f5f5f5';
  context.fillRect(coverX, coverY, coverWidth, coverHeight);

  if (imageAsset) {
    context.save();
    context.beginPath();
    context.rect(coverX, coverY, coverWidth, coverHeight);
    context.clip();
    drawObjectFitCover(context, imageAsset, coverX, coverY, coverWidth, coverHeight);
    context.restore();
  } else {
    context.fillStyle = '#efefef';
    context.fillRect(coverX, coverY, coverWidth, coverHeight);
    context.fillStyle = '#666666';
    context.font = '800 24px sans-serif';
    context.fillText('NO IMAGE', coverX + 18, coverY + 38);
  }

  context.save();
  context.fillStyle = '#111111';
  context.fillRect(x + 12, y + 12, 92, 38);
  context.fillStyle = '#ffffff';
  context.font = '900 15px sans-serif';
  context.textBaseline = 'middle';
  context.fillText(`${anime?.episodes || '?'} 話`, x + 24, y + 31);
  context.restore();

  context.strokeStyle = '#111111';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x, infoY);
  context.lineTo(x + width, infoY);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.fillRect(x, infoY + 1, width, height - coverHeight - 1);

  context.fillStyle = '#111111';
  context.font = '900 21px sans-serif';
  const titleLineHeight = 24;
  const titleTop = infoTop;

  context.fillStyle = '#111111';
  context.font = '900 21px sans-serif';
  drawWrappedText(
    context,
    titleText,
    x + infoPaddingX,
    titleTop,
    infoWidth,
    titleLineHeight,
    2
  );

  context.font = '800 14px sans-serif';
  const metaTop = titleTop + titleAreaHeight + titleToMetaGap;
  const metaBottom = metaLabels.length > 0
    ? drawMetaTagList(
      context,
      metaLabels,
      x + infoPaddingX,
      metaTop,
      infoWidth,
      Number.POSITIVE_INFINITY
    )
    : metaTop;

  if (hasRating) {
    const ratingY = Math.min(
      infoBottom - 28,
      metaBottom + metaToRatingGap
    );
    drawRatingStars(
      context,
      rating,
      x + infoPaddingX,
      ratingY,
      infoWidth
    );
  }
};

const drawEmptyShareCard = (context, x, y, width, height, layout) => {
  const coverHeight = layout.coverHeight;
  const infoY = y + coverHeight;

  context.save();
  context.fillStyle = '#ffffff';
  context.fillRect(x, y, width, height);
  context.strokeStyle = '#d4d4d4';
  context.lineWidth = 1.5;
  context.setLineDash([10, 8]);
  context.strokeRect(x, y, width, height);
  context.setLineDash([]);

  context.fillStyle = '#fafafa';
  context.fillRect(x, y, width, coverHeight);
  context.fillStyle = '#ffffff';
  context.fillRect(x, infoY, width, height - coverHeight);

  context.strokeStyle = '#dcdcdc';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(x, infoY);
  context.lineTo(x + width, infoY);
  context.stroke();
  context.restore();
};

const renderShareImageBlob = async (animePage, options) => {
  const outputWidth = SHARE_IMAGE_WIDTH;
  const outputHeight = SHARE_IMAGE_HEIGHT;
  const renderScale = Math.max(
    SHARE_IMAGE_RENDER_SCALE,
    Math.min(3, Math.ceil((typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1))
  );
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth * renderScale;
  canvas.height = outputHeight * renderScale;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas_context_unavailable');
  }
  context.scale(renderScale, renderScale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const [logoAsset, imageAssets] = await Promise.all([
    loadShareLogoAsset().catch(() => null),
    Promise.all(animePage.map(async (anime) => {
      const source = resolveShareCoverImageUrl(anime);
      try {
        return await loadRemoteImageAsset(source, options.transport);
      } catch (error) {
        console.error('[share-image] image asset load failed', anime?.id, source, error);
        return null;
      }
    })),
  ]);

  try {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.fillStyle = '#111111';
    context.fillRect(0, 0, outputWidth, 18);
    context.strokeStyle = '#111111';
    context.lineWidth = 4;
    context.strokeRect(16, 16, outputWidth - 32, outputHeight - 32);

    if (logoAsset) {
      const logoHeight = 92;
      const naturalWidth = logoAsset.width || logoAsset.naturalWidth || 1;
      const naturalHeight = logoAsset.height || logoAsset.naturalHeight || 1;
      const logoWidth = Math.round(logoHeight * (naturalWidth / naturalHeight));
      context.save();
      context.shadowColor = 'rgba(0, 0, 0, 0.14)';
      context.shadowBlur = 12;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 3;
      context.drawImage(logoAsset, SHARE_IMAGE_PADDING + 10, 54, logoWidth, logoHeight);
      context.restore();
    }

    const pageLabel = `${options.totalItems}作品中 ${options.pageNumber}/${options.totalPages}枚目`;
    context.font = '800 30px sans-serif';
    const pageLabelWidth = Math.ceil(context.measureText(pageLabel).width + 36);
    const pageLabelX = outputWidth - SHARE_IMAGE_PADDING - pageLabelWidth;
    context.fillStyle = '#111111';
    context.fillRect(pageLabelX, 58, pageLabelWidth, 54);
    context.fillStyle = '#ffffff';
    context.fillText(pageLabel, pageLabelX + 18, 95);

    context.fillStyle = '#111111';
    context.fillRect(SHARE_IMAGE_PADDING, 158, outputWidth - (SHARE_IMAGE_PADDING * 2), 5);

    const gridTop = SHARE_IMAGE_HEADER_HEIGHT + 28;
    const gridWidth = outputWidth - (SHARE_IMAGE_PADDING * 2);
    const gridHeight = outputHeight - gridTop - SHARE_IMAGE_FOOTER_HEIGHT - SHARE_IMAGE_PADDING;
    const cardWidth = Math.floor((gridWidth - (SHARE_IMAGE_GRID_GAP * (SHARE_IMAGE_GRID_COLUMNS - 1))) / SHARE_IMAGE_GRID_COLUMNS);
    const cardHeight = Math.floor((gridHeight - (SHARE_IMAGE_GRID_GAP * (SHARE_IMAGE_GRID_ROWS - 1))) / SHARE_IMAGE_GRID_ROWS);
    const cardLayout = buildShareImageCardLayout(context, animePage, cardWidth, cardHeight);

    const totalSlots = SHARE_IMAGE_GRID_COLUMNS * SHARE_IMAGE_GRID_ROWS;

    for (let index = 0; index < totalSlots; index += 1) {
      const anime = animePage[index];
      const row = Math.floor(index / SHARE_IMAGE_GRID_COLUMNS);
      const column = index % SHARE_IMAGE_GRID_COLUMNS;
      const cardX = SHARE_IMAGE_PADDING + ((cardWidth + SHARE_IMAGE_GRID_GAP) * column);
      const cardY = gridTop + ((cardHeight + SHARE_IMAGE_GRID_GAP) * row);
      if (anime) {
        drawImageShareCard(
          context,
          anime,
          imageAssets[index],
          cardX,
          cardY,
          cardWidth,
          cardHeight,
          cardLayout
        );
      } else {
        drawEmptyShareCard(context, cardX, cardY, cardWidth, cardHeight, cardLayout);
      }
    }

    context.fillStyle = '#111111';
    context.fillRect(SHARE_IMAGE_PADDING, outputHeight - 44, outputWidth - (SHARE_IMAGE_PADDING * 2), 4);

    return canvasToBlob(canvas, 'image/png');
  } finally {
    closeImageAsset(logoAsset);
    imageAssets.forEach(closeImageAsset);
  }
};

const createShareImageFiles = async (selectedAnimes, onProgress, transport = 'auto') => {
  const pages = chunkArray(selectedAnimes, SHARE_IMAGE_PAGE_SIZE).slice(0, SHARE_IMAGE_MAX_PAGES);
  const imageItems = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    onProgress(pageIndex + 1, pages.length);
    const blob = await renderShareImageBlob(pages[pageIndex], {
      pageNumber: pageIndex + 1,
      totalPages: pages.length,
      totalItems: selectedAnimes.length,
      startNumber: pageIndex * SHARE_IMAGE_PAGE_SIZE + 1,
      transport,
    });
    const fileName = `anitrigger-share-${pageIndex + 1}-of-${pages.length}.png`;
    imageItems.push({
      file: new File([blob], fileName, { type: 'image/png', lastModified: Date.now() }),
      fileName,
      previewUrl: URL.createObjectURL(blob),
    });
  }

  return imageItems;
};

const revokeGeneratedImageUrls = (items) => {
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  });
};

function ShareScreen({
  mode = 'method',
  animeList = [],
  onUpdateRating,
  onBackToMyList,
  onBackToMethod,
  onSelectMode,
}) {
  const isMethodMode = mode === 'method';
  const isImageMode = mode === 'image';
  const isTextMode = mode === 'text';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [minRating, setMinRating] = useState('');
  const [sortKey, setSortKey] = useState('added');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedAnimeIds, setSelectedAnimeIds] = useState([]);
  const [includeRatingInText, setIncludeRatingInText] = useState(false);
  const [notice, setNotice] = useState({ type: '', message: '' });
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });
  const [generatedImages, setGeneratedImages] = useState([]);
  const [quickNavState, setQuickNavState] = useState({
    visible: false,
    mobile: false,
    nearTop: true,
    nearBottom: false,
  });
  const generatedImagesRef = useRef([]);
  const generatedGalleryRef = useRef(null);
  const listStartRef = useRef(null);

  const uniqueGenres = useMemo(() => {
    const genres = new Set();
    animeList.forEach((anime) => {
      anime?.genres?.forEach((genre) => genres.add(genre));
    });
    return Array.from(genres).sort((left, right) => left.localeCompare(right));
  }, [animeList]);

  const filteredList = useMemo(() => buildFilteredAnimeList(animeList, {
    searchQuery,
    selectedGenres,
    minRating,
    sortKey,
    sortOrder,
  }), [animeList, minRating, searchQuery, selectedGenres, sortKey, sortOrder]);

  const selectedAnimes = useMemo(() => {
    const animeById = new Map(animeList.map((anime) => [anime.id, anime]));
    return selectedAnimeIds.map((id) => animeById.get(id)).filter(Boolean);
  }, [animeList, selectedAnimeIds]);

  useEffect(() => {
    generatedImagesRef.current = generatedImages;
  }, [generatedImages]);

  useEffect(() => () => {
    revokeGeneratedImageUrls(generatedImagesRef.current);
  }, []);

  useEffect(() => {
    setSelectedGenres((prev) => prev.filter((genre) => uniqueGenres.includes(genre)));
  }, [uniqueGenres]);

  useEffect(() => {
    if (!notice.message) return;
    const timer = setTimeout(() => {
      setNotice({ type: '', message: '' });
    }, 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (isMethodMode) {
      setQuickNavState({
        visible: false,
        mobile: false,
        nearTop: true,
        nearBottom: false,
      });
      return;
    }

    let rafId = null;
    const updateQuickNav = () => {
      const scrollTop = window.scrollY || window.pageYOffset || 0;
      const viewportH = window.innerHeight || 0;
      const docH = Math.max(
        document.body?.scrollHeight || 0,
        document.documentElement?.scrollHeight || 0
      );
      const maxScroll = Math.max(0, docH - viewportH);
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const listStartTop = listStartRef.current
        ? listStartRef.current.getBoundingClientRect().top + scrollTop
        : Number.POSITIVE_INFINITY;
      const reachedList = Number.isFinite(listStartTop) && (scrollTop + 72 >= listStartTop);
      const nearTop = scrollTop <= 24;
      const nearBottom = maxScroll - scrollTop <= 24;
      const hasLongContent = maxScroll > 240;
      const visible = hasLongContent && reachedList && (!isMobile || reachedList || nearBottom);

      setQuickNavState((prev) => {
        if (
          prev.visible === visible
          && prev.mobile === isMobile
          && prev.nearTop === nearTop
          && prev.nearBottom === nearBottom
        ) {
          return prev;
        }
        return { visible, mobile: isMobile, nearTop, nearBottom };
      });
    };

    const requestUpdate = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateQuickNav();
      });
    };

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    updateQuickNav();

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, [
    filteredList.length,
    generatedImages.length,
    isMethodMode,
    minRating,
    searchQuery,
    selectedAnimeIds.length,
    selectedGenres,
    sortKey,
    sortOrder,
  ]);

  const clearGeneratedImages = () => {
    if (generatedImagesRef.current.length === 0) return;
    revokeGeneratedImageUrls(generatedImagesRef.current);
    generatedImagesRef.current = [];
    setGeneratedImages([]);
  };

  const handleToggleGenre = (genre) => {
    setSelectedGenres((prev) => (
      prev.includes(genre) ? prev.filter((item) => item !== genre) : [...prev, genre]
    ));
  };

  const handleClearFilters = () => {
    setSelectedGenres([]);
    setMinRating('');
  };

  const handleToggleAnimeSelection = (animeId) => {
    if (isGeneratingImages) return;
    clearGeneratedImages();

    setSelectedAnimeIds((prev) => {
      if (prev.includes(animeId)) {
        return prev.filter((id) => id !== animeId);
      }
      if (isImageMode && prev.length >= SHARE_IMAGE_SELECTION_LIMIT) {
        setNotice({
          type: 'error',
          message: `画像共有は ${SHARE_IMAGE_SELECTION_LIMIT} 作品までです。`,
        });
        return prev;
      }
      return [...prev, animeId];
    });
  };

  const handleSelectAllVisibleForText = () => {
    if (filteredList.length === 0) return;
    setSelectedAnimeIds((prev) => {
      const next = [...prev];
      const selectedSet = new Set(prev);
      filteredList.forEach((anime) => {
        if (!selectedSet.has(anime.id)) {
          selectedSet.add(anime.id);
          next.push(anime.id);
        }
      });
      return next;
    });
    setNotice({ type: 'success', message: `表示中の ${filteredList.length} 件を選択しました。` });
  };

  const handleClearSelection = () => {
    clearGeneratedImages();
    setSelectedAnimeIds([]);
  };

  const handleUpdateRatingFromShare = (animeId, rating) => {
    clearGeneratedImages();
    if (typeof onUpdateRating === 'function') {
      onUpdateRating(animeId, rating);
    }
  };

  const handleCopyText = async () => {
    if (selectedAnimes.length === 0) {
      setNotice({ type: 'error', message: '共有する作品を1件以上選択してください。' });
      return;
    }

    const shareText = buildShareText(selectedAnimes, {
      includeRating: includeRatingInText,
    });

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'AniTrigger Share',
          text: shareText,
        });
        setNotice({ type: 'success', message: `${selectedAnimes.length} 件を共有しました。` });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }

    try {
      await copyTextToClipboard(shareText);
      setNotice({ type: 'success', message: '共有機能が使えないため、テキストをコピーしました。' });
    } catch (_) {
      setNotice({ type: 'error', message: '共有に失敗しました。ブラウザの権限をご確認ください。' });
    }
  };

  const handleCopyTextList = async () => {
    if (selectedAnimes.length === 0) {
      setNotice({ type: 'error', message: '共有する作品を1件以上選択してください。' });
      return;
    }

    try {
      await copyTextToClipboard(buildShareText(selectedAnimes, {
        includeRating: includeRatingInText,
      }));
      setNotice({ type: 'success', message: `${selectedAnimes.length} 件の一覧をコピーしました。` });
    } catch (_) {
      setNotice({ type: 'error', message: '一覧のコピーに失敗しました。ブラウザの権限をご確認ください。' });
    }
  };

  const handleGenerateImages = async () => {
    if (selectedAnimes.length === 0 || isGeneratingImages) return;

    clearGeneratedImages();
    setIsGeneratingImages(true);
    setImageProgress({
      current: 0,
      total: Math.ceil(selectedAnimes.length / SHARE_IMAGE_PAGE_SIZE),
    });

    try {
      const imageItems = await createShareImageFiles(selectedAnimes, (current, total) => {
        setImageProgress({ current, total });
      });
      setGeneratedImages(imageItems);
      setNotice({
        type: 'success',
        message: `${imageItems.length} 枚の画像を生成しました。`,
      });
      requestAnimationFrame(() => {
        generatedGalleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (_) {
      clearGeneratedImages();
      setNotice({
        type: 'error',
        message: '画像の生成に失敗しました。時間を置いてもう一度お試しください。',
      });
    } finally {
      setIsGeneratingImages(false);
    }
  };

  const handleDownloadAllImages = () => {
    if (generatedImages.length === 0) return;

    generatedImages.forEach((item, index) => {
      window.setTimeout(() => {
        const anchor = document.createElement('a');
        anchor.href = item.previewUrl;
        anchor.download = item.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }, index * 140);
    });

    setNotice({
      type: 'success',
      message: `${generatedImages.length} 枚の保存を開始しました。`,
    });
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollToBottom = () => {
    const docH = Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0
    );
    window.scrollTo({ top: docH, behavior: 'smooth' });
  };

  const canShareGeneratedImages = useMemo(() => {
    if (generatedImages.length === 0) return false;
    if (typeof navigator === 'undefined') return false;
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare({ files: generatedImages.map((item) => item.file) });
    } catch (_) {
      return false;
    }
  }, [generatedImages]);

  const handleShareGeneratedImages = async () => {
    if (!canShareGeneratedImages) return;

    try {
      await navigator.share({
        title: 'AniTrigger Share',
        text: `${selectedAnimes.length} 作品を共有`,
        files: generatedImages.map((item) => item.file),
      });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setNotice({
        type: 'error',
        message: '共有に失敗しました。保存した画像を各アプリから共有してください。',
      });
    }
  };

  if (isMethodMode) {
    const hasAnime = animeList.length > 0;
    const canUseImageShare = hasAnime;

    return (
      <>
        <main className="main-content share-screen-main page-shell has-bottom-home-nav">
          <div className="mylist-section-header bookmark-screen-header">
            <div>
              <h3 className="page-main-title">共有方法を選択</h3>
              <p className="page-main-subtitle">共有したい作品を次の画面で絞り込んで選択します。</p>
            </div>
          </div>

          <section className="share-method-guide">
            <p className="share-method-guide-title">ガイド</p>
            <p className="share-method-guide-text">1〜24作品なら画像共有がおすすめです。</p>
            <p className="share-method-guide-text">25作品以上なら文字共有がおすすめです。</p>
            <p className="share-method-guide-note">現在の登録作品数: {animeList.length} 件</p>
          </section>

          <div className="share-method-grid">
            <button
              type="button"
              className="share-method-card"
              onClick={() => onSelectMode('image')}
              disabled={!canUseImageShare}
            >
              <span className="share-method-card-badge">画像</span>
              <strong className="share-method-card-title">画像で共有</strong>
              <span className="share-method-card-text">
                24作品まで。6作品ごとに自動分割し、最大4枚の画像にまとめます。
              </span>
            </button>

            <button
              type="button"
              className="share-method-card"
              onClick={() => onSelectMode('text')}
              disabled={!hasAnime}
            >
              <span className="share-method-card-badge">文字</span>
              <strong className="share-method-card-title">文字で共有</strong>
              <span className="share-method-card-text">
                作品数の上限なし。選択した作品リストをテキストとして共有できます。
              </span>
            </button>
          </div>

          {!hasAnime && (
            <div className="empty-state">共有できる作品がまだありません</div>
          )}
        </main>

        <nav className="screen-bottom-home-nav" aria-label="画面移動">
          <button type="button" className="screen-bottom-home-button" onClick={onBackToMyList}>
            ← マイリストへ戻る
          </button>
        </nav>
      </>
    );
  }

  return (
    <>
      <main className="main-content share-screen-main mylist-page-main page-shell has-selection-dock">
        <div className="mylist-section-header bookmark-screen-header">
          <div>
            <h3 className="page-main-title">{isImageMode ? '画像で共有' : '文字で共有'}</h3>
            <p className="page-main-subtitle">
              {isImageMode
                ? `共有したい作品を ${SHARE_IMAGE_SELECTION_LIMIT} 件まで選択してください。`
                : '共有したい作品を選択してください。'}
            </p>
          </div>
          <div className="bookmark-screen-actions mylist-screen-actions">
            {isTextMode && (
              <label className="share-inline-toggle">
                <input
                  type="checkbox"
                  checked={includeRatingInText}
                  onChange={(event) => setIncludeRatingInText(event.target.checked)}
                />
                <span>評価を含める</span>
              </label>
            )}
            <button type="button" className="bookmark-screen-home" onClick={onBackToMethod}>
              共有方法を選び直す
            </button>
          </div>
        </div>

        {notice.message && (
          <div className={`bookmark-action-notice ${notice.type}`}>
            {notice.message}
          </div>
        )}

        {isImageMode && isGeneratingImages && (
          <div className="share-progress-panel" role="status" aria-live="polite">
            画像を生成中です ({imageProgress.current}/{imageProgress.total} 枚目)
          </div>
        )}

        <div className="controls share-screen-controls">
          <div className="search-box">
            <i className="search-icon">🔍</i>
            <input
              type="text"
              placeholder="共有する作品を検索"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          <div className="sort-box">
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="sort-order-button"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              title={sortOrder === 'asc' ? '昇順' : '降順'}
              aria-label={sortOrder === 'asc' ? '昇順で並び替え' : '降順で並び替え'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        <AnimeFilterPanel
          uniqueGenres={uniqueGenres}
          selectedGenres={selectedGenres}
          minRating={normalizeMinRatingFilter(minRating)}
          onToggleGenre={handleToggleGenre}
          onMinRatingChange={setMinRating}
          onClearFilters={handleClearFilters}
          sectionClassName="mylist-genre-filter-section share-filter-section"
          title="共有候補の絞り込み"
          contextId={`share-${mode}`}
        />

        <div className="selection-toolbar" role="region" aria-label="共有候補の選択">
          <div className="selection-toolbar-info">
            <p className="selection-toolbar-title">{isImageMode ? '画像共有の選択' : '文字共有の選択'}</p>
            <p className="selection-toolbar-count">
              {isImageMode
                ? `${selectedAnimeIds.length}/${SHARE_IMAGE_SELECTION_LIMIT} 件を選択中`
                : `${selectedAnimeIds.length} 件を選択中`}
            </p>
            <p className="selection-toolbar-sub">
              {isImageMode
                ? `6作品ごとに1枚、最大${SHARE_IMAGE_MAX_PAGES}枚の画像を作成します。`
                : '検索や絞り込みで候補を減らしてから選択できます。'}
            </p>
          </div>
          {isTextMode && (
            <div className="selection-toolbar-actions">
              <button
                type="button"
                className="share-inline-action"
                onClick={handleSelectAllVisibleForText}
                disabled={filteredList.length === 0}
              >
                表示中をすべて選択
              </button>
              <button
                type="button"
                className="share-inline-action"
                onClick={handleClearSelection}
                disabled={selectedAnimeIds.length === 0}
              >
                すべて解除
              </button>
            </div>
          )}
        </div>

        <div className="results-count">
          {filteredList.length} 作品が見つかりました
        </div>

        {isImageMode && generatedImages.length > 0 && (
          <section ref={generatedGalleryRef} className="share-generated-gallery">
            <div className="share-generated-gallery-header">
              <div>
                <h4>生成した画像</h4>
                <p>{generatedImages.length} 枚の画像を作成しました。必要なら個別保存もできます。</p>
              </div>
            </div>
            <div
              className={`share-generated-gallery-grid${generatedImages.length === 1 ? ' single-item' : ''}`}
            >
              {generatedImages.map((item, index) => (
                <article key={item.fileName} className="share-generated-card">
                  <img src={item.previewUrl} alt={`共有画像 ${index + 1}`} />
                  <a className="share-generated-download" href={item.previewUrl} download={item.fileName}>
                    画像 {index + 1} を保存
                  </a>
                </article>
              ))}
            </div>
          </section>
        )}

        <div ref={listStartRef} className="anime-grid">
          {filteredList.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              onRemove={() => {}}
              isSelectionMode
              isSelected={selectedAnimeIds.includes(anime.id)}
              onToggleSelect={handleToggleAnimeSelection}
              onUpdateRating={handleUpdateRatingFromShare}
              allowRatingEditInSelectionMode
            />
          ))}
        </div>

        {filteredList.length === 0 && (
          <div className="empty-state">該当する作品がありません</div>
        )}
      </main>

      <div className="selection-action-dock share-action-dock" role="region" aria-label="共有操作">
        <p className="selection-action-dock-count">
          {isImageMode
            ? `${selectedAnimeIds.length}/${SHARE_IMAGE_SELECTION_LIMIT} 件を選択中`
            : `${selectedAnimeIds.length} 件を選択中`}
        </p>
        <div className="selection-action-dock-buttons share-action-dock-buttons">
          {isImageMode ? (
            generatedImages.length > 0 ? (
              <>
                {canShareGeneratedImages && (
                  <button type="button" className="share-dock-primary" onClick={handleShareGeneratedImages}>
                    画像を共有
                  </button>
                )}
                <button type="button" className="share-dock-primary" onClick={handleDownloadAllImages}>
                  画像を保存
                </button>
                <button type="button" className="share-dock-secondary" onClick={handleClearSelection}>
                  キャンセル
                </button>
                <button type="button" className="share-dock-secondary" onClick={onBackToMyList}>
                  マイリストに戻る
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="share-dock-primary"
                  onClick={handleGenerateImages}
                  disabled={selectedAnimeIds.length === 0 || isGeneratingImages}
                >
                  {isGeneratingImages ? '画像を生成中...' : '画像を生成'}
                </button>
                <button
                  type="button"
                  className="share-dock-secondary"
                  onClick={handleClearSelection}
                  disabled={selectedAnimeIds.length === 0 || isGeneratingImages}
                >
                  すべて解除
                </button>
                <button type="button" className="share-dock-secondary" onClick={onBackToMyList}>
                  マイリストに戻る
                </button>
              </>
            )
          ) : (
            <>
              <button
                type="button"
                className="share-dock-primary"
                onClick={handleCopyText}
                disabled={selectedAnimeIds.length === 0}
              >
                共有
              </button>
              <button
                type="button"
                className="share-dock-secondary"
                onClick={handleCopyTextList}
                disabled={selectedAnimeIds.length === 0}
              >
                コピー
              </button>
              <button
                type="button"
                className="share-dock-secondary"
                onClick={handleClearSelection}
                disabled={selectedAnimeIds.length === 0}
              >
                すべて解除
              </button>
              <button type="button" className="share-dock-secondary" onClick={onBackToMyList}>
                マイリストに戻る
              </button>
            </>
          )}
        </div>
      </div>

      {!isMethodMode && quickNavState.visible && (
        <aside
          className={`quick-nav-rail share-screen-quick-nav ${quickNavState.mobile ? 'mobile' : ''}`}
          aria-label="ページ移動"
        >
          <button
            type="button"
            className="quick-nav-button"
            onClick={handleScrollToTop}
            disabled={quickNavState.nearTop}
            aria-label="ページ最上部へ移動"
            title="最上部へ"
          >
            ↑
          </button>
          <button
            type="button"
            className="quick-nav-button"
            onClick={handleScrollToBottom}
            disabled={quickNavState.nearBottom}
            aria-label="ページ最下部へ移動"
            title="最下部へ"
          >
            ↓
          </button>
        </aside>
      )}
    </>
  );
}

export default ShareScreen;
