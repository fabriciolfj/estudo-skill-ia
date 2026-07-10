import { ping } from './index';

describe('index', () => {
  it('deve retornar "ok"', () => {
    expect(ping()).toBe('ok');
  });
});
