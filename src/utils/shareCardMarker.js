const SHARE_CARD_MAGIC_BYTES = [0x41, 0x54]; // AT
const SHARE_CARD_MARKER_VERSION = 1;
const SHARE_CARD_MAX_ITEMS = 6;
const SHARE_CARD_MAX_ID = 0xffffff;
const SHARE_CARD_BIT_REPEAT = 3;
const SHARE_CARD_GRID_SIZE = 31;
const SHARE_CARD_FINDER_SIZE = 7;
const SHARE_CARD_RESERVED_SIZE = 9;

export const SHARE_CARD_IMAGE_LOGICAL_WIDTH = 1800;
export const SHARE_CARD_IMAGE_LOGICAL_HEIGHT = 2100;
export const SHARE_CARD_MARKER_LOGICAL_SIZE = 155;
export const SHARE_CARD_MARKER_LOGICAL_X = 1559;
export const SHARE_CARD_MARKER_LOGICAL_Y = 56;

const SHARE_CARD_MARKER_LEGACY_LOGICAL_Y = 121;

const isInReservedFinderArea = (x, y) => {
  const maxReservedStart = SHARE_CARD_GRID_SIZE - SHARE_CARD_RESERVED_SIZE;
  return (
    (x < SHARE_CARD_RESERVED_SIZE && y < SHARE_CARD_RESERVED_SIZE)
    || (x >= maxReservedStart && y < SHARE_CARD_RESERVED_SIZE)
    || (x < SHARE_CARD_RESERVED_SIZE && y >= maxReservedStart)
  );
};

const getMarkerDataCells = () => {
  const cells = [];
  for (let y = 0; y < SHARE_CARD_GRID_SIZE; y += 1) {
    for (let x = 0; x < SHARE_CARD_GRID_SIZE; x += 1) {
      if (!isInReservedFinderArea(x, y)) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
};

const MARKER_DATA_CELLS = getMarkerDataCells();

const normalizeByte = (value) => Math.max(0, Math.min(255, Math.floor(Number(value) || 0)));

const crc16Ccitt = (bytes) => {
  let crc = 0xffff;
  bytes.forEach((byteValue) => {
    crc ^= normalizeByte(byteValue) << 8;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc & 0x8000)
        ? ((crc << 1) ^ 0x1021)
        : (crc << 1);
      crc &= 0xffff;
    }
  });
  return crc & 0xffff;
};

const bytesToBits = (bytes) => {
  const bits = [];
  bytes.forEach((byteValue) => {
    const byte = normalizeByte(byteValue);
    for (let bitIndex = 7; bitIndex >= 0; bitIndex -= 1) {
      bits.push((byte >> bitIndex) & 1);
    }
  });
  return bits;
};

const bitsToBytes = (bits) => {
  const bytes = [];
  for (let index = 0; index + 7 < bits.length; index += 8) {
    let byte = 0;
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      byte = (byte << 1) | (bits[index + bitIndex] ? 1 : 0);
    }
    bytes.push(byte);
  }
  return bytes;
};

const normalizeAnimeIds = (animeIds) => {
  const seen = new Set();
  const normalized = [];
  (Array.isArray(animeIds) ? animeIds : []).forEach((id) => {
    const numericId = Math.floor(Number(id));
    if (!Number.isFinite(numericId) || numericId <= 0 || numericId > SHARE_CARD_MAX_ID) return;
    if (seen.has(numericId)) return;
    seen.add(numericId);
    normalized.push(numericId);
  });
  return normalized.slice(0, SHARE_CARD_MAX_ITEMS);
};

export const createShareCardMarkerPayload = ({
  animeIds = [],
  pageNumber = 1,
  totalPages = 1,
  totalItems = 0,
} = {}) => ({
  version: SHARE_CARD_MARKER_VERSION,
  pageNumber: Math.max(1, Math.min(255, Math.floor(Number(pageNumber) || 1))),
  totalPages: Math.max(1, Math.min(255, Math.floor(Number(totalPages) || 1))),
  totalItems: Math.max(0, Math.min(255, Math.floor(Number(totalItems) || 0))),
  animeIds: normalizeAnimeIds(animeIds),
});

const encodeShareCardMarkerBytes = (payload) => {
  const safePayload = createShareCardMarkerPayload(payload);
  const bytes = [
    ...SHARE_CARD_MAGIC_BYTES,
    SHARE_CARD_MARKER_VERSION,
    safePayload.pageNumber,
    safePayload.totalPages,
    safePayload.totalItems,
    safePayload.animeIds.length,
  ];

  safePayload.animeIds.forEach((id) => {
    bytes.push((id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff);
  });

  const checksum = crc16Ccitt(bytes);
  bytes.push((checksum >> 8) & 0xff, checksum & 0xff);
  return bytes;
};

const encodeShareCardMarkerBits = (payload) => {
  const bits = bytesToBits(encodeShareCardMarkerBytes(payload));
  const repeatedBits = [];
  bits.forEach((bit) => {
    for (let index = 0; index < SHARE_CARD_BIT_REPEAT; index += 1) {
      repeatedBits.push(bit);
    }
  });
  return repeatedBits;
};

const drawFinderPattern = (context, originX, originY, cellSize) => {
  for (let y = 0; y < SHARE_CARD_FINDER_SIZE; y += 1) {
    for (let x = 0; x < SHARE_CARD_FINDER_SIZE; x += 1) {
      const isOuter = x === 0 || x === SHARE_CARD_FINDER_SIZE - 1 || y === 0 || y === SHARE_CARD_FINDER_SIZE - 1;
      const isCenter = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      if (!isOuter && !isCenter) continue;
      context.fillRect(originX + (x * cellSize), originY + (y * cellSize), cellSize, cellSize);
    }
  }
};

export const drawShareCardMarker = (context, payload, x, y, size) => {
  if (!context) return;

  const markerBits = encodeShareCardMarkerBits(payload);
  const cellSize = size / SHARE_CARD_GRID_SIZE;
  context.save();
  context.fillStyle = '#ffffff';
  context.fillRect(x, y, size, size);
  context.strokeStyle = '#ffffff';
  context.lineWidth = Math.max(2, cellSize * 0.6);
  context.strokeRect(x, y, size, size);

  context.fillStyle = '#111111';
  drawFinderPattern(context, x + cellSize, y + cellSize, cellSize);
  drawFinderPattern(context, x + ((SHARE_CARD_GRID_SIZE - SHARE_CARD_RESERVED_SIZE + 1) * cellSize), y + cellSize, cellSize);
  drawFinderPattern(context, x + cellSize, y + ((SHARE_CARD_GRID_SIZE - SHARE_CARD_RESERVED_SIZE + 1) * cellSize), cellSize);

  MARKER_DATA_CELLS.forEach((cell, index) => {
    const bit = index < markerBits.length
      ? markerBits[index]
      : ((cell.x + cell.y) % 7 === 0 ? 1 : 0);
    if (!bit) return;
    context.fillRect(x + (cell.x * cellSize), y + (cell.y * cellSize), cellSize, cellSize);
  });
  context.restore();
};

const loadImageElementFromFile = (file) => new Promise((resolve, reject) => {
  if (typeof URL === 'undefined' || typeof Image === 'undefined') {
    reject(new Error('image_api_unavailable'));
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const decodePromise = typeof image.decode === 'function'
      ? image.decode().catch(() => undefined)
      : Promise.resolve();
    decodePromise.finally(() => resolve({ image, objectUrl }));
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('share_card_image_load_failed'));
  };
  image.src = objectUrl;
});

const sampleMarkerCell = (imageData, markerWidth, markerHeight, cellX, cellY, cellWidth, cellHeight) => {
  const samplePoints = [
    [0.5, 0.5],
    [0.36, 0.36],
    [0.64, 0.36],
    [0.36, 0.64],
    [0.64, 0.64],
  ];
  let darkVotes = 0;
  let totalVotes = 0;

  samplePoints.forEach(([offsetX, offsetY]) => {
    const x = Math.max(0, Math.min(markerWidth - 1, Math.floor((cellX * cellWidth) + (cellWidth * offsetX))));
    const y = Math.max(0, Math.min(markerHeight - 1, Math.floor((cellY * cellHeight) + (cellHeight * offsetY))));
    const dataIndex = (y * markerWidth + x) * 4;
    const red = imageData.data[dataIndex];
    const green = imageData.data[dataIndex + 1];
    const blue = imageData.data[dataIndex + 2];
    const alpha = imageData.data[dataIndex + 3] / 255;
    const luminance = ((0.2126 * red) + (0.7152 * green) + (0.0722 * blue)) * alpha + (255 * (1 - alpha));
    if (luminance < 144) {
      darkVotes += 1;
    }
    totalVotes += 1;
  });

  return darkVotes > totalVotes / 2 ? 1 : 0;
};

const decodeBytesFromMarkerBits = (bits) => {
  const correctedBits = [];
  for (let index = 0; index + SHARE_CARD_BIT_REPEAT - 1 < bits.length; index += SHARE_CARD_BIT_REPEAT) {
    let darkCount = 0;
    for (let repeatIndex = 0; repeatIndex < SHARE_CARD_BIT_REPEAT; repeatIndex += 1) {
      darkCount += bits[index + repeatIndex] ? 1 : 0;
    }
    correctedBits.push(darkCount >= 2 ? 1 : 0);
  }
  return bitsToBytes(correctedBits);
};

const parseShareCardMarkerBytes = (bytes) => {
  if (!Array.isArray(bytes) || bytes.length < 9) return null;
  if (bytes[0] !== SHARE_CARD_MAGIC_BYTES[0] || bytes[1] !== SHARE_CARD_MAGIC_BYTES[1]) return null;
  if (bytes[2] !== SHARE_CARD_MARKER_VERSION) return null;

  const count = bytes[6];
  if (!Number.isInteger(count) || count < 1 || count > SHARE_CARD_MAX_ITEMS) return null;

  const expectedLength = 7 + (count * 3) + 2;
  if (bytes.length < expectedLength) return null;

  const payloadBytes = bytes.slice(0, expectedLength - 2);
  const expectedChecksum = (bytes[expectedLength - 2] << 8) | bytes[expectedLength - 1];
  if (crc16Ccitt(payloadBytes) !== expectedChecksum) return null;

  const animeIds = [];
  let cursor = 7;
  for (let index = 0; index < count; index += 1) {
    const id = (bytes[cursor] << 16) | (bytes[cursor + 1] << 8) | bytes[cursor + 2];
    if (id > 0) {
      animeIds.push(id);
    }
    cursor += 3;
  }

  if (animeIds.length === 0) return null;

  return {
    version: bytes[2],
    pageNumber: bytes[3] || 1,
    totalPages: bytes[4] || 1,
    totalItems: bytes[5] || animeIds.length,
    animeIds,
  };
};

const decodeShareCardMarkerFromContext = (
  context,
  imageWidth,
  imageHeight,
  offsetX = 0,
  offsetY = 0,
  sizeScale = 1,
  logicalY = SHARE_CARD_MARKER_LOGICAL_Y
) => {
  const scaleX = imageWidth / SHARE_CARD_IMAGE_LOGICAL_WIDTH;
  const scaleY = imageHeight / SHARE_CARD_IMAGE_LOGICAL_HEIGHT;
  const markerX = (SHARE_CARD_MARKER_LOGICAL_X * scaleX) + offsetX;
  const markerY = (logicalY * scaleY) + offsetY;
  const markerWidth = SHARE_CARD_MARKER_LOGICAL_SIZE * scaleX * sizeScale;
  const markerHeight = SHARE_CARD_MARKER_LOGICAL_SIZE * scaleY * sizeScale;

  if (markerX < 0 || markerY < 0 || markerX + markerWidth > imageWidth || markerY + markerHeight > imageHeight) {
    return null;
  }

  const sourceX = Math.floor(markerX);
  const sourceY = Math.floor(markerY);
  const sourceWidth = Math.max(1, Math.ceil(markerWidth));
  const sourceHeight = Math.max(1, Math.ceil(markerHeight));
  const imageData = context.getImageData(sourceX, sourceY, sourceWidth, sourceHeight);
  const cellWidth = sourceWidth / SHARE_CARD_GRID_SIZE;
  const cellHeight = sourceHeight / SHARE_CARD_GRID_SIZE;
  const bits = MARKER_DATA_CELLS.map((cell) => (
    sampleMarkerCell(imageData, sourceWidth, sourceHeight, cell.x, cell.y, cellWidth, cellHeight)
  ));
  return parseShareCardMarkerBytes(decodeBytesFromMarkerBits(bits));
};

export const decodeShareCardMarkerFromFile = async (file) => {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    throw new Error('share_card_file_not_image');
  }
  if (typeof document === 'undefined') {
    throw new Error('document_unavailable');
  }

  const { image, objectUrl } = await loadImageElementFromFile(file);
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      throw new Error('share_card_image_size_unavailable');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('canvas_context_unavailable');
    }
    context.drawImage(image, 0, 0, width, height);

    const baseCellSize = SHARE_CARD_MARKER_LOGICAL_SIZE * (width / SHARE_CARD_IMAGE_LOGICAL_WIDTH) / SHARE_CARD_GRID_SIZE;
    const offsetValues = [0, -0.28, 0.28].map((value) => value * baseCellSize);
    const sizeScales = [1, 0.985, 1.015];
    const logicalYValues = [...new Set([SHARE_CARD_MARKER_LOGICAL_Y, SHARE_CARD_MARKER_LEGACY_LOGICAL_Y])];
    for (const logicalY of logicalYValues) {
      for (const sizeScale of sizeScales) {
        for (const offsetY of offsetValues) {
          for (const offsetX of offsetValues) {
            const payload = decodeShareCardMarkerFromContext(context, width, height, offsetX, offsetY, sizeScale, logicalY);
            if (payload) return payload;
          }
        }
      }
    }

    throw new Error('share_card_marker_not_found');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
