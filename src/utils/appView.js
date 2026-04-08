export const APP_VIEW_HASHES = {
  home: '#/',
  homeCustomize: '#/home/customize',
  homeCustomizeSlider: '#/home/customize/slider',
  homeCustomizeStats: '#/home/customize/stats',
  homeCustomizeQuick: '#/home/customize/quick-actions',
  mylist: '#/mylist',
  shareMethod: '#/mylist/share',
  shareImage: '#/mylist/share/image',
  shareText: '#/mylist/share/text',
  add: '#/add',
  addCurrent: '#/add/current-season',
  addNext: '#/add/next-season',
  bookmarks: '#/bookmarks',
};

export const APP_VIEW_SET = new Set(Object.keys(APP_VIEW_HASHES));

export const getViewFromLocation = (hash = '', pathname = '') => {
  const route = (hash || '').replace(/^#/, '');
  if (route.startsWith('/home/customize/slider')) return 'homeCustomizeSlider';
  if (route.startsWith('/home/customize/quick-actions')) return 'homeCustomizeQuick';
  if (route.startsWith('/home/customize/stats')) return 'homeCustomizeStats';
  if (route.startsWith('/home/customize')) return 'homeCustomize';
  if (route.startsWith('/add/current-season')) return 'addCurrent';
  if (route.startsWith('/add/next-season')) return 'addNext';
  if (route.startsWith('/bookmarks/add') || route.startsWith('/bookmark/add')) return 'add';
  if (route.startsWith('/mylist/share/image')) return 'shareImage';
  if (route.startsWith('/mylist/share/text')) return 'shareText';
  if (route.startsWith('/mylist/share')) return 'shareMethod';
  if (route.startsWith('/mylist')) return 'mylist';
  if (route.startsWith('/bookmarks') || route.startsWith('/bookmark')) return 'bookmarks';
  if (route.startsWith('/add')) return 'add';

  if (pathname.startsWith('/home/customize/slider')) return 'homeCustomizeSlider';
  if (pathname.startsWith('/home/customize/quick-actions')) return 'homeCustomizeQuick';
  if (pathname.startsWith('/home/customize/stats')) return 'homeCustomizeStats';
  if (pathname.startsWith('/home/customize')) return 'homeCustomize';
  if (pathname.startsWith('/add/current-season')) return 'addCurrent';
  if (pathname.startsWith('/add/next-season')) return 'addNext';
  if (pathname.startsWith('/bookmarks/add') || pathname.startsWith('/bookmark/add')) return 'add';
  if (pathname.startsWith('/mylist/share/image')) return 'shareImage';
  if (pathname.startsWith('/mylist/share/text')) return 'shareText';
  if (pathname.startsWith('/mylist/share')) return 'shareMethod';
  if (pathname.startsWith('/mylist')) return 'mylist';
  if (pathname.startsWith('/bookmarks') || pathname.startsWith('/bookmark')) return 'bookmarks';
  if (pathname.startsWith('/add')) return 'add';
  return 'home';
};
