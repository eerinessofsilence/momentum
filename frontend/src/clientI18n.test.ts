import { describe, expect, it } from 'vitest'
import { localizeClientError, translateClient } from './clientI18n'

describe('client localization helpers', () => {
  it('translates every supported client locale', () => {
    expect(translateClient('en', 'settings')).toBe('Settings')
    expect(translateClient('fr', 'settings')).toBe('Paramètres')
    expect(translateClient('es', 'settings')).toBe('Ajustes')
    expect(translateClient('de', 'settings')).toBe('Einstellungen')
  })

  it('interpolates translated values', () => {
    expect(translateClient('de', 'received', { asset: 'BTC' })).toBe('BTC erhalten')
    expect(translateClient('en', 'confirmationCode')).toBe('Confirmation code')
  })

  it('does not expose backend English errors in localized interfaces', () => {
    expect(localizeClientError('Insufficient balance', 'fr')).toBe('Solde insuffisant.')
    expect(localizeClientError('Unknown backend error', 'de')).toBe('Etwas ist schiefgelaufen. Versuche es erneut.')
  })
})
