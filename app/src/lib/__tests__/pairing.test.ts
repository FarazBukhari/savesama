import { baseUrl, isValidHost, parsePairLink, parsePort, validatePair } from '../pairing';

describe('parsePairLink', () => {
  it('parses the server deep link', () => {
    expect(parsePairLink('savesama://pair?host=192.168.1.20&port=8765&token=abcDEF_123-x&name=Pixel%208%20(Termux)')).toEqual({
      host: '192.168.1.20',
      port: 8765,
      token: 'abcDEF_123-x',
      name: 'Pixel 8 (Termux)',
    });
  });
  it('accepts localhost, hostnames, IPv6 and a missing name', () => {
    expect(parsePairLink('savesama://pair?host=127.0.0.1&port=8765&token=t')?.name).toBeNull();
    expect(parsePairLink('savesama://pair?host=my-pc.local&port=1&token=t')?.host).toBe('my-pc.local');
    expect(parsePairLink('savesama://pair?host=%5Bfe80%3A%3A1%5D&port=8765&token=t')?.host).toBe('fe80::1');
    expect(parsePairLink('savesama:///pair?host=10.0.0.2&port=8765&token=t')?.host).toBe('10.0.0.2');
  });
  it('rejects invalid links', () => {
    expect(parsePairLink('https://example.com/pair?host=1.2.3.4&port=1&token=t')).toBeNull();
    expect(parsePairLink('savesama://pair?host=1.2.3.4&port=0&token=t')).toBeNull();
    expect(parsePairLink('savesama://pair?host=1.2.3.4&port=70000&token=t')).toBeNull();
    expect(parsePairLink('savesama://pair?host=1.2.3.4&port=8765&token=')).toBeNull();
    expect(parsePairLink('savesama://pair?host=999.1.1.1&port=8765&token=t')).toBeNull();
    expect(parsePairLink('savesama://pair?host=a%20b&port=8765&token=t')).toBeNull();
    expect(parsePairLink('savesama://other?host=1.2.3.4&port=8765&token=t')).toBeNull();
  });
});

describe('validation helpers', () => {
  it('parsePort', () => {
    expect(parsePort('8765')).toBe(8765);
    expect(parsePort(' 80 ')).toBe(80);
    expect(parsePort('0')).toBeNull();
    expect(parsePort('65536')).toBeNull();
    expect(parsePort('12a')).toBeNull();
  });
  it('isValidHost', () => {
    expect(isValidHost('192.168.1.20')).toBe(true);
    expect(isValidHost('localhost')).toBe(true);
    expect(isValidHost('')).toBe(false);
    expect(isValidHost('1.2.3')).toBe(false);
    expect(isValidHost('http://1.2.3.4')).toBe(false);
  });
  it('validatePair trims and keeps the name optional', () => {
    expect(validatePair({ host: ' 10.0.0.5 ', port: '8765', token: ' k ', name: '  ' })).toEqual({
      host: '10.0.0.5',
      port: 8765,
      token: 'k',
      name: null,
    });
  });
  it('baseUrl brackets IPv6', () => {
    expect(baseUrl('127.0.0.1', 8765)).toBe('http://127.0.0.1:8765');
    expect(baseUrl('fe80::1', 8765)).toBe('http://[fe80::1]:8765');
  });
});
