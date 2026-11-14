import { describe, expect, it } from 'vitest'
import * as geometry from '../..'
import { floorMesh, makeNamer, sanitize, wallMesh } from '../mesh'

/**
 * The mesh builder is shared by the OBJ and GLB exporters so they cannot
 * describe different models. It is internal: only the exporters are public.
 */

describe('names', () => {
  it('keeps only letters, digits, underscore, dot and dash', () => {
    expect(sanitize('w1')).toBe('w1')
    expect(sanitize('a b\n"c"{}')).toBe('a_b__c___')
    expect(sanitize('')).toBe('_')
  })

  it('gives a numeric suffix to a name that was already taken', () => {
    const name = makeNamer()
    expect(name('wall', 'a')).toBe('wall_a')
    expect(name('wall', 'a')).toBe('wall_a_2')
    expect(name('wall', 'a')).toBe('wall_a_3')
    expect(name('floor', 'a')).toBe('floor_a')
  })

  it('treats ids that sanitise to the same text as a collision', () => {
    const name = makeNamer()
    expect(name('wall', 'a b')).toBe('wall_a_b')
    expect(name('wall', 'a\nb')).toBe('wall_a_b_2')
  })

  it('keeps each namer independent', () => {
    expect(makeNamer()('wall', 'a')).toBe('wall_a')
    expect(makeNamer()('wall', 'a')).toBe('wall_a')
  })
})

describe('the public entry point', () => {
  it('exports the exporters and not the internal mesh builder', () => {
    expect(typeof geometry.toObj).toBe('function')
    const exported = Object.keys(geometry)
    for (const hidden of ['wallMesh', 'floorMesh', 'sanitize', 'makeNamer']) {
      expect(exported).not.toContain(hidden)
    }
  })

  it('has a mesh builder to share', () => {
    expect(typeof wallMesh).toBe('function')
    expect(typeof floorMesh).toBe('function')
  })
})
