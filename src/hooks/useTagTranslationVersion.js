import { useEffect, useState } from 'react';
import {
  getTagTranslationVersion,
  subscribeTagTranslationUpdates,
} from '../constants/animeData';

export const useTagTranslationVersion = () => {
  const [version, setVersion] = useState(() => getTagTranslationVersion());

  useEffect(() => subscribeTagTranslationUpdates(setVersion), []);

  return version;
};

export default useTagTranslationVersion;
