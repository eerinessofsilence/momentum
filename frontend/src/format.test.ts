import { describe, expect, it } from 'vitest'
import { assetAmount, money, shortAddress, timeLabel } from './format'

describe('format helpers', () => {
  it('formats USD values consistently', () => {
    expect(money('9431.9')).toBe('$9,431.90')
  })

  it('formats crypto values without a negative sign in row labels', () => {
    expect(assetAmount('-0.031', 'BTC')).toBe('0.031 BTC')
  })

  it('shortens long wallet addresses', () => {
    expect(shortAddress('bc1qmomentumvaultaddress', 6, 4)).toBe('bc1qmo…ress')
  })

  it('returns a usable time label', () => {
    expect(timeLabel('2026-08-05T12:30:00Z')).toMatch(/12:30|03:30|02:30|15:30/)
  })
})
