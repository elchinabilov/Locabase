import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Modal } from '../src/renderer/src/components/ui.js'
import { I18nProvider } from '../src/renderer/src/i18n/index.js'

const wrap = (ui: ReactNode): ReturnType<typeof render> => render(<I18nProvider>{ui}</I18nProvider>)

describe('Modal', () => {
  it('is an accessible dialog labelled by its title', () => {
    wrap(
      <Modal title="Delete row" onClose={() => undefined}>
        body
      </Modal>
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('Delete row')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    wrap(
      <Modal title="T" onClose={onClose}>
        body
      </Modal>
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  /**
   * The grid's value zoom opens inside a row editor. One Escape used to close
   * both, because the listener was on `window` rather than on the dialog.
   */
  it('does not let Escape reach a dialog underneath', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    wrap(
      <Modal title="Outer" onClose={outer}>
        <Modal title="Inner" onClose={inner}>
          body
        </Modal>
      </Modal>
    )
    const dialogs = screen.getAllByRole('dialog')
    fireEvent.keyDown(dialogs[dialogs.length - 1]!, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('closes when the overlay behind it is clicked', () => {
    const onClose = vi.fn()
    const { container } = wrap(
      <Modal title="T" onClose={onClose}>
        body
      </Modal>
    )
    const overlay = container.firstElementChild!
    fireEvent.mouseDown(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open when the dialog itself is clicked', () => {
    const onClose = vi.fn()
    wrap(
      <Modal title="T" onClose={onClose}>
        body
      </Modal>
    )
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus into the dialog on open', () => {
    wrap(
      <Modal title="T" onClose={() => undefined}>
        <button>inside</button>
      </Modal>
    )
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('restores focus to the trigger on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const { unmount } = wrap(
      <Modal title="T" onClose={() => undefined}>
        body
      </Modal>
    )
    expect(trigger).not.toHaveFocus()
    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  /** Without the trap, Tab walks straight into the sidebar behind the overlay. */
  it('wraps Tab from the last control back to the first', () => {
    wrap(
      <Modal title="T" onClose={() => undefined} footer={<button>Save</button>}>
        <button>First</button>
      </Modal>
    )
    const save = screen.getByRole('button', { name: 'Save' })
    save.focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('wraps Shift+Tab from the dialog back to the last control', () => {
    wrap(
      <Modal title="T" onClose={() => undefined} footer={<button>Save</button>}>
        <button>First</button>
      </Modal>
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
  })
})
