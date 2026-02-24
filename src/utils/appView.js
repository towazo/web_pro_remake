export const APP_VIEW_HASHES = {
  home: '#/',
  homeCustomize: '#/home/customize',
  mylist: '#/mylist',
  add: '#/add',
  addCurrent: '#/add/current-season',
  addNext: '#/add/next-season',
  bookmarks: '#/bookmarks',
};

export const APP_VIEW_SET = new Set(Object.keys(APP_VIEW_HASHES));

export const getViewFromLocation = (hash = '', pathname = '') => {
  const route = (hash || '').replace(/^#/, '');
  if (route.startsWith('/home/customize')) return 'homeCustomize';
  if (route.startsWith('/add/current-season')) return 'addCurrent';
  if (route.startsWith('/add/next-season')) return 'addNext';
  if (route.startsWith('/bookmarks/add') || route.startsWith('/bookmark/add')) return 'add';
  if (route.startsWith('/mylist')) return 'mylist';
  if (route.startsWith('/bookmarks') || route.startsWith('/bookmark')) return 'bookmarks';
  if (route.startsWith('/add')) return 'add';

  if (pathname.startsWith('/home/customize')) return 'homeCustomize';
  if (pathname.startsWith('/add/current-season')) return 'addCurrent';
  if (pathname.startsWith('/add/next-season')) return 'addNext';
  if (pathname.startsWith('/bookmarks/add') || pathname.startsWith('/bookmark/add')) return 'add';
  if (pathname.startsWith('/mylist')) return 'mylist';
  if (pathname.startsWith('/bookmarks') || pathname.startsWith('/bookmark')) return 'bookmarks';
  if (pathname.startsWith('/add')) return 'add';
  return 'home';
};
