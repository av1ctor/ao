/* eslint-disable no-throw-literal */
import { describe, test } from 'node:test'
import assert from 'node:assert'

import { createLogger } from '../logger.js'
import { bytesToBase64, maybeAoLoadWith } from './hydrateMessages.js'

const logger = createLogger('ao-cu:readState')

describe('hydrateMessages', () => {
  describe('bytesToBase64', () => {
    function base64ToBytes (base64) {
      const binString = atob(base64)
      return Uint8Array.from(binString, (m) => m.codePointAt(0))
    }

    test('should convert the bytes to base64', async () => {
      const arrBuffer = await new Response('Hello World').arrayBuffer()
      const res = bytesToBase64(arrBuffer)
      assert(res)
      assert.equal(
        new TextDecoder().decode(base64ToBytes(res)),
        'Hello World'
      )
    })

    test('should handle unicode', async () => {
      const arrBuffer = await new Response('Hello World 🤖❌⚡️').arrayBuffer()
      const res = bytesToBase64(arrBuffer)
      assert(res)
      assert.equal(
        new TextDecoder().decode(base64ToBytes(res)),
        'Hello World 🤖❌⚡️'
      )
    })
  })

  describe.todo('maybeMessageIdWith', () => {})

  describe('maybeAoLoadWith', () => {
    test('should build the ao-load message', async () => {
      const notAoLoad = {
        message: {
          id: 'message-tx-345',
          tags: [
            { name: 'Data-Protocol', value: 'ao' },
            { name: 'ao-type', value: 'message' },
            { name: 'function', value: 'notify' }
          ],
          data: 'foobar'
        }
      }
      const aoLoad = {
        message: {
          id: 'message-tx-456',
          tags: [
            { name: 'Data-Protocol', value: 'ao' },
            { name: 'ao-type', value: 'message' },
            { name: 'function', value: 'notify' },
            { name: 'ao-load', value: 'message-tx-123' }
          ],
          data: 'overwritten'
        }
      }

      async function * messageStream () {
        yield notAoLoad
        yield aoLoad
        yield notAoLoad
      }

      const maybeAoLoad = maybeAoLoadWith({
        loadTransactionData: async (id) => {
          assert.equal(id, 'message-tx-123')
          return new Response('Hello World 🤖❌⚡️')
        },
        loadTransactionMeta: async (id) => {
          assert.equal(id, 'message-tx-123')
          return {
            id: 'message-tx-123',
            anchor: 'anchor-123',
            owner: {
              address: 'owner-123'
            },
            tags: [
              { name: 'foo', value: 'bar' }
            ]
          }
        },
        logger
      })

      const hydrated = maybeAoLoad(messageStream())

      const messages = []
      for await (const message of hydrated) messages.push(message)

      assert.equal(messages.length, 3)
      const [one, two, three] = messages
      assert.deepStrictEqual(one, notAoLoad)
      assert.deepStrictEqual(three, notAoLoad)

      console.log(two)
      assert.deepStrictEqual(two, {
        ...aoLoad,
        message: {
          ...aoLoad.message,
          // original data overwritten with constructed data item
          data: {
            id: 'message-tx-123',
            anchor: 'anchor-123',
            owner: 'owner-123',
            tags: [
              { name: 'foo', value: 'bar' }
            ],
            data: bytesToBase64(await new Response('Hello World 🤖❌⚡️').arrayBuffer())
          }
        }
      })
    })
  })
})
