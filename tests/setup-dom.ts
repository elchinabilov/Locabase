/**
 * DOM-project setup: the `toHaveFocus` / `toHaveAccessibleName` style matchers,
 * and a clean document between tests.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)
