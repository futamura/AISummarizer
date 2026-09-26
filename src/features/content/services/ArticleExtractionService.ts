import { extractPDF, extractReadability, extractX, extractYoutube, isXStatusUrl } from '@/features/content/extractors';
import { ArticleExtractionResult } from '@/types';
import { getDesktopYoutubeUrl, isInvalidUrl, logger } from '@/utils';

export class ArticleExtractionService {
  async execute(url: string): Promise<ArticleExtractionResult> {
    logger.debug('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'extracting', '\nurl:', url);

    /**
     * Skip processing for browser-specific URLs
     */
    if (await isInvalidUrl(url)) {
      logger.warn('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Skipping extraction for invalid URLs', url);
      return {
        isSuccess: false,
        title: null,
        url: url,
        content: null,
        error: new Error('Skipping extraction for invalid URLs'),
      };
    }

    /**
     * Mobile YouTube: the page has no transcript, and Readability would pick up the video description
     * instead. The service worker reloads the video in the desktop layout when an AI service is chosen
     */
    if (getDesktopYoutubeUrl(url)) {
      logger.debug('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Skipping extraction on the mobile YouTube layout', url);
      return {
        isSuccess: false,
        title: null,
        url: url,
        content: null,
        error: new Error('The mobile YouTube layout has no transcript'),
      };
    }

    /**
     * YouTube
     */
    if (/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/.test(url)) {
      logger.debug('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Extracting youtube video');
      try {
        return await extractYoutube(url);
      } catch (error: any) {
        logger.error('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Failed to extract youtube video:', error);
        return {
          isSuccess: false,
          title: null,
          url: url,
          content: null,
          error: error instanceof Error ? error : new Error('Failed to extract article'),
        };
      }
    }

    /**
     * PDF
     */
    if (url.endsWith('.pdf')) {
      logger.debug('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Extracting pdf');
      try {
        return await extractPDF(url);
      } catch (error: any) {
        logger.error('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Failed to extract pdf:', error);
        return {
          isSuccess: false,
          title: null,
          url: url,
          content: null,
          error: error instanceof Error ? error : new Error('Failed to extract pdf'),
        };
      }
    }

    /**
     * X (single post page)
     */
    if (isXStatusUrl(url)) {
      logger.debug('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Extracting X post');
      try {
        const result = await extractX(document);
        if (result.isSuccess) return result;
        /* Fall through to Readability so that a markup change on X degrades instead of failing */
        logger.warn('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Falling back to Readability for X post');
      } catch (error: any) {
        logger.error('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Failed to extract X post:', error);
      }
    }

    /**
     * Normal web page
     */
    try {
      /** Extract article */
      logger.debug('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Extracting normal web page');
      return await extractReadability(document);
    } catch (error: any) {
      logger.error('🧑‍🍳📖', '[ArticleExtractionService.tsx]', '[execute]', 'Failed to extract article:', error);
      return {
        isSuccess: false,
        title: null,
        url: url,
        content: null,
        error: error instanceof Error ? error : new Error('Failed to extract article'),
      };
    }
  }
}
