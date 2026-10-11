import { ipcMain, shell } from 'electron'
import type { AuthStatus, LoginResult } from '../shared/types'
import { accountFor, completeDeviceLogin, deviceLoginAvailable, logout, resolveCredential, saveLogin, startDeviceLogin } from '../core/auth'

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function authStatus(): Promise<AuthStatus> {
  const available = deviceLoginAvailable()
  const credential = await resolveCredential()
  if (!credential) return { account: null, error: null, deviceLoginAvailable: available }
  try {
    return { account: await accountFor(credential), error: null, deviceLoginAvailable: available }
  } catch (err) {
    return { account: null, error: message(err), deviceLoginAvailable: available }
  }
}

/** Canaux `auth:*` de la connexion GitHub, enregistrés à l'identique par l'application et par le studio. */
export function registerAuthIpc(): void {
  let pending: { controller: AbortController; deviceCode: string; interval: number } | null = null

  ipcMain.handle('auth:status', () => authStatus())

  ipcMain.handle('auth:startDevice', async () => {
    pending?.controller.abort()
    pending = null
    try {
      const login = await startDeviceLogin()
      pending = { controller: new AbortController(), deviceCode: login.deviceCode, interval: login.interval }
      void shell.openExternal(login.verificationUri)
      return { ok: true, login: { userCode: login.userCode, verificationUri: login.verificationUri, expiresAt: login.expiresAt } }
    } catch (err) {
      return { ok: false, error: message(err) }
    }
  })

  ipcMain.handle('auth:waitDevice', async (): Promise<LoginResult> => {
    const current = pending
    if (!current) return { ok: false, cancelled: false, error: 'Aucune connexion en cours.' }
    try {
      return { ok: true, account: await completeDeviceLogin(current.deviceCode, current.interval, current.controller.signal) }
    } catch (err) {
      return { ok: false, cancelled: current.controller.signal.aborted, error: message(err) }
    } finally {
      if (pending === current) pending = null
    }
  })

  ipcMain.handle('auth:cancelDevice', () => pending?.controller.abort())

  ipcMain.handle('auth:loginWithToken', async (_e, token: string): Promise<LoginResult> => {
    const value = typeof token === 'string' ? token.trim() : ''
    if (!value) return { ok: false, cancelled: false, error: 'Colle un jeton GitHub.' }
    try {
      return { ok: true, account: await saveLogin(value) }
    } catch (err) {
      const text = message(err)
      return { ok: false, cancelled: false, error: /401|refuse/.test(text) ? 'GitHub refuse ce jeton : vérifie qu’il est complet et pas expiré.' : text }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    await logout()
    return authStatus()
  })
}
