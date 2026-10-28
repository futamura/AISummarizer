/**
 * @jest-environment jsdom
 */
import { extractVimeo, parsePlayerConfig, parseVimeoVideoUrl, parseVtt, parseVttTimestamp, selectTextTrack, VimeoTextTrack } from '../Vimeo';

const uploaded = (lang: string, kind = 'subtitles'): VimeoTextTrack => ({
  lang,
  kind,
  url: `https://captions.vimeo.com/captions/${lang}.vtt`,
  provenance: 'user_uploaded',
});

const generated = (lang: string): VimeoTextTrack => ({
  lang: `${lang}-x-autogen`,
  kind: 'subtitles',
  url: `https://captions.vimeo.com/captions/${lang}-x-autogen.vtt`,
  provenance: 'ai_generated',
});

/* Shaped like the embed player page: the config is assigned in an inline script without a semicolon */
const playerPage = (config: object): string =>
  `<!DOCTYPE html><html><body><div id="player" class="player"></div><script>window.playerConfig = ${JSON.stringify(config)}</script><script>var other = 1;</script></body></html>`;

describe('parseVimeoVideoUrl', () => {
  it.each([
    ['https://vimeo.com/76979871', { id: '76979871', hash: null }],
    ['https://www.vimeo.com/76979871?share=copy', { id: '76979871', hash: null }],
    ['https://vimeo.com/76979871#t=30s', { id: '76979871', hash: null }],
    ['https://vimeo.com/1226731365/0123456789', { id: '1226731365', hash: '0123456789' }],
    ['https://vimeo.com/channels/staffpicks/1226731365', { id: '1226731365', hash: null }],
    ['https://vimeo.com/groups/shortfilms/videos/1226731365', { id: '1226731365', hash: null }],
    ['https://vimeo.com/showcase/11376793/video/1226731365', { id: '1226731365', hash: null }],
    ['https://vimeo.com/album/11376793/video/1226731365', { id: '1226731365', hash: null }],
  ])('reads %s', (url, expected) => {
    expect(parseVimeoVideoUrl(url)).toEqual(expected);
  });

  it.each([
    'https://vimeo.com/',
    'https://vimeo.com/channels/staffpicks',
    'https://vimeo.com/channels/staffpicks/videos',
    'https://vimeo.com/showcase/11376793',
    'https://vimeo.com/user12345',
    'https://vimeo.com/76979871/likes',
    'https://vimeo.com/76979871/feed',
    'https://player.vimeo.com/video/76979871',
    'https://example.com/76979871',
  ])('rejects %s', url => {
    expect(parseVimeoVideoUrl(url)).toBeNull();
  });
});

describe('parsePlayerConfig', () => {
  it('reads the config assigned in the inline script', () => {
    const config = { request: { text_tracks: [uploaded('en')] }, video: { title: 'Too Rough' } };
    expect(parsePlayerConfig(playerPage(config))).toEqual(config);
  });

  it('accepts a trailing semicolon', () => {
    expect(parsePlayerConfig('<script>window.playerConfig = {"video":{"title":"a"}};</script>')).toEqual({ video: { title: 'a' } });
  });

  it('returns null for a page without a config or with a broken one', () => {
    expect(parsePlayerConfig('<html><body>Sorry</body></html>')).toBeNull();
    expect(parsePlayerConfig('<script>window.playerConfig = {"video":</script>')).toBeNull();
  });
});

describe('selectTextTrack', () => {
  it('returns null when the video has no tracks', () => {
    expect(selectTextTrack([], 'en-US')).toBeNull();
  });

  it('uses the auto-generated track when nothing was uploaded', () => {
    expect(selectTextTrack([generated('de')], 'en-US')?.lang).toBe('de-x-autogen');
  });

  it('prefers an uploaded track over the auto-generated one', () => {
    expect(selectTextTrack([generated('en'), uploaded('tr')], 'en-US')?.lang).toBe('tr');
  });

  it('prefers the browser language among uploaded tracks', () => {
    const tracks = [uploaded('es-ES'), uploaded('it'), uploaded('en'), uploaded('fr')];
    expect(selectTextTrack(tracks, 'fr-FR')?.lang).toBe('fr');
    expect(selectTextTrack(tracks, 'es')?.lang).toBe('es-ES');
  });

  it('falls back to the spoken language, then to the first uploaded track', () => {
    const tracks = [uploaded('it'), uploaded('en'), generated('en')];
    expect(selectTextTrack(tracks, 'ja')?.lang).toBe('en');
    expect(selectTextTrack([uploaded('it'), uploaded('fr')], 'ja')?.lang).toBe('it');
  });

  it('tells auto-generated tracks apart by the language suffix alone', () => {
    const tracks = [
      { lang: 'en-x-autogen', url: 'a.vtt' },
      { lang: 'de', url: 'b.vtt' },
    ];
    expect(selectTextTrack(tracks, 'en-US')?.lang).toBe('de');
  });
});

describe('parseVttTimestamp', () => {
  it('parses timestamps with and without hours', () => {
    expect(parseVttTimestamp('00:00:05.237')).toBeCloseTo(5.237);
    expect(parseVttTimestamp('01:02:03.500')).toBeCloseTo(3723.5);
    expect(parseVttTimestamp('02:03.250')).toBeCloseTo(123.25);
  });

  it('ignores the end time and the cue settings after the start', () => {
    expect(parseVttTimestamp('00:01:00.000 --> 00:01:02.000 align:start')).toBe(60);
  });

  it('returns 0 for invalid input', () => {
    expect(parseVttTimestamp('invalid')).toBe(0);
  });
});

describe('parseVtt', () => {
  it('reads the cues and drops markup, cue numbers, notes and empty cues', () => {
    const vtt = [
      'WEBVTT',
      '',
      'NOTE written by hand',
      '',
      '1',
      '00:00:05.237 --> 00:00:08.043',
      "<i>Here at Vimeo, there's always</i>",
      '<i>one thing on our minds:</i>',
      '',
      '2',
      '00:00:08.043 --> 00:00:11.022 line:90%',
      'Tom &amp; Jerry say &lt;hi&gt; &#39;there&#x27;',
      '',
      '3',
      '00:01:10.000 --> 00:01:11.000',
      '<c.music></c>',
      '',
    ].join('\r\n');
    expect(parseVtt(vtt)).toEqual([
      { start: 5.237, text: "Here at Vimeo, there's always one thing on our minds:" },
      { start: 8.043, text: "Tom & Jerry say <hi> 'there'" },
    ]);
  });

  it('returns an empty array for a file without cues', () => {
    expect(parseVtt('WEBVTT\n\n')).toEqual([]);
  });
});

describe('extractVimeo', () => {
  const fetchMock = jest.fn();
  const response = (body: string, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
  const vtt = ['WEBVTT', '', '1', '00:00:01.480 --> 00:00:02.120', 'My brothers,', '', '2', '00:01:05.260 --> 00:01:07.160', 'I know this city.', ''].join(
    '\n'
  );

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    document.head.innerHTML = '';
    jest.spyOn(navigator, 'language', 'get').mockReturnValue('en-US');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extracts the title and the captions grouped by minute with timestamp links', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(playerPage({ request: { text_tracks: [generated('en')] }, video: { title: 'Too Rough', url: 'https://vimeo.com/1209896622' } }))
      )
      .mockResolvedValueOnce(response(vtt));

    const result = await extractVimeo('https://vimeo.com/1209896622', document);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://player.vimeo.com/video/1209896622');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://captions.vimeo.com/captions/en-x-autogen.vtt');
    expect(result).toEqual({
      isSuccess: true,
      title: 'Too Rough',
      url: 'https://vimeo.com/1209896622',
      content: ['[0:01](https://vimeo.com/1209896622#t=1s) My brothers,', '[1:05](https://vimeo.com/1209896622#t=65s) I know this city.'].join('\n'),
      error: null,
    });
  });

  it('passes the hash of an unlisted video to the player and keeps it in the links', async () => {
    fetchMock
      .mockResolvedValueOnce(response(playerPage({ request: { text_tracks: [uploaded('en')] }, video: { title: 'a' } })))
      .mockResolvedValueOnce(response(vtt));

    const result = await extractVimeo('https://vimeo.com/1226731365/0123456789', document);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://player.vimeo.com/video/1226731365?h=0123456789');
    expect(result.content).toContain('(https://vimeo.com/1226731365/0123456789#t=1s)');
  });

  it('takes the hash from the player meta tag only while it points at the same video', async () => {
    document.head.innerHTML = '<meta name="twitter:player" content="https://player.vimeo.com/video/1226731365?h=abcdef0123">';
    fetchMock.mockResolvedValue(response(playerPage({ request: { text_tracks: [] } })));

    await extractVimeo('https://vimeo.com/channels/staffpicks/1226731365', document);
    await extractVimeo('https://vimeo.com/1209896622', document);

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://player.vimeo.com/video/1226731365?h=abcdef0123');
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://player.vimeo.com/video/1209896622');
  });

  it('resolves a relative track URL against the player page', async () => {
    fetchMock
      .mockResolvedValueOnce(response(playerPage({ request: { text_tracks: [{ lang: 'en', url: '/texttrack/1.vtt?token=x' }] } })))
      .mockResolvedValueOnce(response(vtt));

    await extractVimeo('https://vimeo.com/76979871', document);

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://player.vimeo.com/texttrack/1.vtt?token=x');
  });

  it('fails without fetching the captions when the video has none', async () => {
    /* A video without captions has no text_tracks at all */
    fetchMock.mockResolvedValueOnce(response(playerPage({ request: {}, video: { title: 'a' } })));

    const result = await extractVimeo('https://vimeo.com/1236790091', document);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ isSuccess: false, title: null, content: null, url: 'https://vimeo.com/1236790091' });
    expect(result.error?.message).toBe('The video has no captions');
  });

  it.each([
    ['the player page is not found', [response('Not found', 404)], 'The player page returned 404'],
    ['the player page has no config', [response('<html></html>')], 'Player config not found'],
    ['the captions cannot be fetched', [response(playerPage({ request: { text_tracks: [uploaded('en')] } })), response('', 403)], 'The captions returned 403'],
    ['the captions are empty', [response(playerPage({ request: { text_tracks: [uploaded('en')] } })), response('WEBVTT\n')], 'The captions are empty'],
  ])('fails when %s', async (_, responses, message) => {
    responses.forEach(r => fetchMock.mockResolvedValueOnce(r));

    const result = await extractVimeo('https://vimeo.com/76979871', document);

    expect(result.isSuccess).toBe(false);
    expect(result.error?.message).toBe(message);
  });

  it('fails on a URL that is not a video page', async () => {
    const result = await extractVimeo('https://vimeo.com/channels/staffpicks', document);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.isSuccess).toBe(false);
  });
});
