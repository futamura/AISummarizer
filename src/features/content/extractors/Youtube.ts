import { ArticleExtractionResult } from '@/types';
import { logger, waitForElement } from '@/utils';

interface TranscriptSegment {
  start: number;
  texts: string[];
}

/**
 * Matches transcript segment elements of both the legacy transcript panel
 * (ytd-transcript-segment-renderer) and the new view-model based panel
 * (transcript-segment-view-model) that YouTube is gradually rolling out.
 */
const SEGMENT_SELECTOR = 'ytd-transcript-segment-renderer, transcript-segment-view-model';

/**
 * Parse timestamp string to seconds
 * @param timestamp - The timestamp string in format "MM:SS" or "HH:MM:SS"
 * @returns The number of seconds
 */
export function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Format seconds into time string
 * @param seconds - The number of seconds
 * @returns The formatted time string in format "MM:SS" or "HH:MM:SS"
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    // HH:MM:SS format for times over 1 hour
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    // MM:SS format for times under 1 hour
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

/**
 * Group transcript segments by time intervals
 * @param segments - Array of transcript segments
 * @returns Array of grouped transcript segments
 */
export function groupTranscriptSegments(segments: { start: number; text: string }[]): TranscriptSegment[] {
  const groups: TranscriptSegment[] = [];
  let currentGroup: TranscriptSegment | null = null;

  for (const segment of segments) {
    if (!currentGroup || segment.start - currentGroup.start >= 60) {
      currentGroup = { start: segment.start, texts: [] };
      groups.push(currentGroup);
    }
    currentGroup.texts.push(segment.text);
  }

  return groups;
}

/**
 * Extract timestamp and text from a single transcript segment element,
 * supporting both the legacy and the new view-model based panel structure
 * @param element - The transcript segment element
 * @returns The parsed segment, or null if timestamp or text is missing
 */
function parseSegmentElement(element: Element): { start: number; text: string } | null {
  const isLegacy = element.tagName.toLowerCase() === 'ytd-transcript-segment-renderer';
  const timestampElement = element.querySelector(isLegacy ? '.segment-timestamp' : '.ytwTranscriptSegmentViewModelTimestamp');
  const textElement = element.querySelector(isLegacy ? '.segment-text' : '.ytAttributedStringHost');

  const timestamp = timestampElement?.textContent?.trim() || '';
  const text = textElement?.textContent?.trim() || '';
  if (!timestamp || !text) {
    return null;
  }

  return {
    start: parseTimestamp(timestamp),
    text,
  };
}

/**
 * Extract transcript segments from DOM
 * @returns Array of transcript segments
 */
function extractTranscriptSegments(): { start: number; text: string }[] {
  const segments: { start: number; text: string }[] = [];

  document.querySelectorAll(SEGMENT_SELECTOR).forEach(element => {
    const segment = parseSegmentElement(element);
    if (segment) {
      segments.push(segment);
    }
  });

  return segments;
}

/**
 * Wait until the number of rendered transcript segments becomes stable,
 * so that all segments are present before extraction
 * @param maxAttempts - The maximum number of polling attempts
 * @returns The number of rendered segments (0 if none appeared)
 */
async function waitForStableSegmentCount(maxAttempts = 15): Promise<number> {
  let previousCount = 0;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const count = document.querySelectorAll(SEGMENT_SELECTOR).length;
    if (count > 0 && count === previousCount) {
      return count;
    }
    previousCount = count;
  }
  return previousCount;
}

/**
 * This function is used to extract the YouTube transcript.
 * @param videoId - The ID of the YouTube video.
 * @returns The transcript of the YouTube video.
 */
export async function extractYoutube(urls: string): Promise<ArticleExtractionResult> {
  /** Extract youtube video id from url */
  const urlMatch = urls.match(/(?:watch\?v=|embed\/|v\/|shorts\/)?([a-zA-Z0-9_-]{11})/);
  const videoId = urlMatch ? urlMatch[1] : null;
  const rawUrl = urls;
  if (!videoId) {
    throw new Error('Could not extract video ID from URL');
  }
  logger.debug('🎥', '[Youtube.tsx]', '[extractYoutube]', 'Extracting YouTube transcript', videoId);

  try {
    /** Wait for 2 seconds */
    await new Promise(resolve => setTimeout(resolve, 4000));

    /** Wait for the transcript button and click it */
    const transcriptButton = await waitForElement('#description-inline-expander ytd-video-description-transcript-section-renderer button');
    if (!(transcriptButton instanceof HTMLElement)) {
      throw new Error('Transcript button not found');
    }
    transcriptButton.click();

    /** Wait until the transcript segments are rendered and their count is stable */
    const segmentCount = await waitForStableSegmentCount();
    if (segmentCount === 0) {
      throw new Error('Transcript segments not found');
    }

    /** Extract the transcript segments */
    const rawSegments = extractTranscriptSegments();
    const segments = groupTranscriptSegments(rawSegments);

    /** Convert segments to string format */
    const content = segments
      .map(segment => {
        const timestamp = formatTime(segment.start);
        const url = `https://youtu.be/${videoId}?t=${Math.floor(segment.start)}s`;
        return `[${timestamp}](${url}) ${segment.texts.join(' ')}`;
      })
      .join('\n');

    /** Wait for the title */
    const titleElement = await waitForElement('#above-the-fold #title');
    const title = titleElement?.textContent?.trim() || null;

    /**
     * Hide the transcript panel. The panel is located from a rendered segment
     * because its target-id differs between the legacy and the new panel
     * (and is sometimes absent on the new one)
     */
    const segmentElement = document.querySelector(SEGMENT_SELECTOR);
    const panel = segmentElement?.closest('ytd-engagement-panel-section-list-renderer');
    if (panel instanceof HTMLElement) {
      panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
    }

    /** Return the result */
    return {
      isSuccess: true,
      title: title,
      url: rawUrl,
      content,
      error: null,
    };
  } catch (error) {
    logger.error('🎥', '[Youtube.tsx]', '[extractYoutube]', 'Error extracting YouTube transcript', error);
    return {
      isSuccess: false,
      title: null,
      url: rawUrl,
      content: null,
      error: error instanceof Error ? error : new Error('An error occurred'),
    };
  }
}
