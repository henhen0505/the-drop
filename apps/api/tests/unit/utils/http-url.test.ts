import { describe, expect, it } from 'vitest';
import { httpUrl } from '../../../src/utils/http-url';

describe('httpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(httpUrl.parse('https://example.com/poster.jpg')).toBe('https://example.com/poster.jpg');
    expect(httpUrl.parse('http://example.com')).toBe('http://example.com');
    expect(httpUrl.parse('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
  });

  it('trims surrounding whitespace', () => {
    expect(httpUrl.parse('  https://example.com  ')).toBe('https://example.com');
  });

  it('rejects script and data schemes that would run or embed content when rendered', () => {
    expect(httpUrl.safeParse('javascript:alert(1)').success).toBe(false);
    expect(httpUrl.safeParse('data:text/html,<script>alert(1)</script>').success).toBe(false);
    expect(httpUrl.safeParse('vbscript:msgbox(1)').success).toBe(false);
  });

  it('rejects other non-web schemes', () => {
    expect(httpUrl.safeParse('ftp://example.com/file').success).toBe(false);
    expect(httpUrl.safeParse('file:///etc/passwd').success).toBe(false);
    expect(httpUrl.safeParse('mailto:a@b.com').success).toBe(false);
  });

  it('rejects things that are not absolute URLs', () => {
    expect(httpUrl.safeParse('example.com').success).toBe(false);
    expect(httpUrl.safeParse('/relative/path').success).toBe(false);
    expect(httpUrl.safeParse('').success).toBe(false);
  });

  it('rejects a URL longer than 2048 characters', () => {
    expect(httpUrl.safeParse(`https://example.com/${'a'.repeat(2048)}`).success).toBe(false);
    expect(httpUrl.safeParse(`https://example.com/${'a'.repeat(100)}`).success).toBe(true);
  });
});
