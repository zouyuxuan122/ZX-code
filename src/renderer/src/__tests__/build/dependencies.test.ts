import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * These tests guard against a packaging regression where transitive
 * dependencies that are required by multiple top-level packages fail to
 * hoist to the top-level node_modules inside the packaged app.asar.
 *
 * Root cause: @koa/router requires 'koa-compose', and koa also requires
 * 'koa-compose'. electron-builder's app-builder nested the copy under
 * `node_modules/koa/node_modules/koa-compose`, so @koa/router could not
 * resolve it at runtime, producing "Cannot find module 'koa-compose'".
 *
 * Fix: declare koa-compose as a direct dependency so it is guaranteed to
 * exist at the top-level node_modules in the asar.
 */
describe('packaging dependencies', () => {
  const pkg = JSON.parse(
    readFileSync(resolve(__dirname, '../../../../../package.json'), 'utf-8'),
  ) as { dependencies: Record<string, string> }

  it('declares koa-compose as a direct dependency so it hoists to top-level node_modules in the asar', () => {
    expect(pkg.dependencies).toHaveProperty('koa-compose')
  })

  it('declares koa-compose at the same major version koa depends on (^4.1.0)', () => {
    expect(pkg.dependencies['koa-compose']).toMatch(/^\^?4\./)
  })
})
