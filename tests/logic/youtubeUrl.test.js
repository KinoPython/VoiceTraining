import { describe, test, expect } from 'vitest';
import { parseYoutubeId } from '../../src/logic/youtubeUrl.js';

const ID = 'dQw4w9WgXcQ';

describe('parseYoutubeId', () => {
  test.each([
    `https://youtu.be/${ID}?t=43`,
    `https://www.youtube.com/watch?v=${ID}&list=PL1`,
    `https://youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}&t=5`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `  https://youtu.be/${ID}  `,
    `youtu.be/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `http://youtu.be/${ID}`,
  ])('ID を取り出せる: %s', (input) => {
    expect(parseYoutubeId(input)).toBe(ID);
  });

  test.each([
    '',
    '   ',
    'hello',
    `https://example.com/watch?v=${ID}`,
    'javascript:alert(1)',
    'https://www.youtube.com/watch?v=short',
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://evilyoutube.com/watch?v=${ID}`,
    `https://evil.com/youtu.be/${ID}`,
    `ftp://youtu.be/${ID}`,
    `https://youtu.be/${ID}x`,
    `https://www.youtube.com/watch?v=${ID}x`,
    `https://www.youtube.com/`,
    null,
    undefined,
    123,
  ])('null になる: %s', (input) => {
    expect(parseYoutubeId(input)).toBeNull();
  });
});
