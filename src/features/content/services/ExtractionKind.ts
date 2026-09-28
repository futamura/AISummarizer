import { isXStatusUrl } from '@/features/content/extractors/X';
import { getDesktopYoutubeUrl } from '@/utils';

export type ExtractionKind = 'youtube' | 'pdf' | 'x' | 'webpage';

const YOUTUBE_VIDEO_PATTERN = /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/;

/**
 * Which extractor a URL goes to
 * @param url - The page URL
 * @returns The kind of content; a mobile YouTube URL counts as YouTube
 */
export const getExtractionKind = (url: string): ExtractionKind => {
  if (getDesktopYoutubeUrl(url) || YOUTUBE_VIDEO_PATTERN.test(url)) return 'youtube';
  if (url.endsWith('.pdf')) return 'pdf';
  if (isXStatusUrl(url)) return 'x';
  return 'webpage';
};

export const EXTRACTION_MESSAGES: Record<ExtractionKind, { progress: string; failure: string }> = {
  webpage: { progress: 'Extracting article…', failure: "Couldn't extract the article from this page" },
  youtube: { progress: 'Extracting transcript…', failure: "Couldn't get the transcript of this video" },
  pdf: { progress: 'Extracting PDF…', failure: "Couldn't read this PDF" },
  x: { progress: 'Extracting post…', failure: "Couldn't extract this post" },
};

/* The failure toast replaces the progress toast */
export const EXTRACTION_TOAST_GROUP = 'extract';
