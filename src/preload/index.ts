import { contextBridge, ipcRenderer } from 'electron'
import { IPC_EVENTS, type IpcChannel, type IpcEventName, type IpcEvents } from '@shared/ipc.js'

export interface InvokeResult<T> {
  ok: boolean
  data?: T
  error?: string
}

const api = {
  invoke: <T>(channel: IpcChannel, req?: unknown): Promise<InvokeResult<T>> =>
    ipcRenderer.invoke(channel, req) as Promise<InvokeResult<T>>,

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
