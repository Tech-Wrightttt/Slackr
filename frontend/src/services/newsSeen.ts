/**
 * Remembers which version's release notes were opened on this device, so the navbar can show a dot
 * on News until the current version's notes have been read.
 */
const KEY = 'slackr_news_seen';
export const NEWS_SEEN_EVENT = 'slackr:news-seen';

export const hasUnreadNews = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== __APP_VERSION__;
  } catch {
    return false;
  }
};

export const markNewsSeen = () => {
  try {
    localStorage.setItem(KEY, __APP_VERSION__);
  } catch {
    // Storage blocked: the dot just stays
  }
  window.dispatchEvent(new Event(NEWS_SEEN_EVENT));
};
