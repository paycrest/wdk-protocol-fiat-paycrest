import { describe, expect, test } from '@jest/globals'

import { PaycrestApiError } from '../index.js'
import { toWdkStatus, getOrderDirection } from '../src/status.js'

describe('PaycrestApiError', () => {
  test('should carry the HTTP status, error data and retry hint', () => {
    const error = new PaycrestApiError('Failed', { status: 400, data: { field: 'Source' }, retryAfter: 2 })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('PaycrestApiError')
    expect(error.message).toBe('Failed')
    expect(error.status).toBe(400)
    expect(error.data).toEqual({ field: 'Source' })
    expect(error.retryAfter).toBe(2)
  })

  test('should work without details', () => {
    const error = new PaycrestApiError('Failed')

    expect(error.status).toBeUndefined()
    expect(error.data).toBeUndefined()
  })
})

describe('status helpers', () => {
  test('should infer direction from the source type when direction is absent', () => {
    expect(getOrderDirection({ source: { type: 'fiat' } })).toBe('onramp')
    expect(getOrderDirection({ source: { type: 'crypto' } })).toBe('offramp')
    expect(getOrderDirection({ direction: 'onramp', source: { type: 'crypto' } })).toBe('onramp')
    expect(getOrderDirection(undefined)).toBe('offramp')
  })

  test('should treat validated as completed only for off-ramp', () => {
    expect(toWdkStatus('validated', 'offramp')).toBe('completed')
    expect(toWdkStatus('validated', 'onramp')).toBe('in_progress')
  })
})
