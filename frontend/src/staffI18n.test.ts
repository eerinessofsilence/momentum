import { describe, expect, it } from 'vitest'
import { buildStaffEmail, translateStaff } from './staffI18n'

describe('staff localization helpers', () => {
  it('builds a normalized local email from the username', () => {
    expect(buildStaffEmail('Mia_Warren!')).toBe('mia_warren@momentum-wallet.com')
  })

  it('translates staff labels and interpolates values', () => {
    expect(translateStaff('ru', 'totalClients')).toBe('Всего клиентов')
    expect(translateStaff('ru', 'remaining', { count: 3 })).toContain('3')
    expect(translateStaff('ru', 'receivedAsset', { asset: 'BTC' })).toBe('Получено BTC')
    expect(translateStaff('uk', 'totalClients')).toBe('Усього клієнтів')
    expect(translateStaff('uk', 'depositRequests')).toBe('Заявки на поповнення')
  })
})
