import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcChannel,
  type IpcEventName,
  type IpcEvents
} from '@shared/ipc.js'

export interface InvokeResult<T> {
  ok: boolean
  data?: T
  error?: string
}

const api = {
  // `IpcChannel` is a build-time type and nothing survives of it at runtime, so
  // the allowlist has to be an actual check — the same one `on()` already does
  // for events. `docs/security.md` describes the bridge as a fixed set of
  // channels; this is what makes that true.
  invoke: <T>(channel: IpcChannel, req?: unknown): Promise<InvokeResult<T>> => {
    if (!IPC_CHANNELS.includes(channel)) throw new Error(`unknown channel: ${channel}`)
    return ipcRenderer.invoke(channel, req) as Promise<InvokeResult<T>>
  },

  on: <E extends IpcEventName>(event: E, cb: (payload: IpcEvents[E]) => void): (() => void) => {
    if (!IPC_EVENTS.includes(event)) throw new Error(`unknown event: ${event}`)
    const listener = (_e: unknown, payload: IpcEvents[E]): void => cb(payload)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.off(event, listener)
  },

  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)

export type PreloadApi = typeof api
