/**
 * VEW-4: the part of jsdom (MIT, already a dev dependency of the viewer, which runs its DOM tests
 * in it) that the preview page's test uses. jsdom ships no types of its own, and this saves adding
 * @types/jsdom for one test.
 */
declare module 'jsdom' {
  export interface ConstructorOptions {
    runScripts?: 'dangerously' | 'outside-only'
    pretendToBeVisual?: boolean
    beforeParse?(window: Window & typeof globalThis): void
  }
  export class JSDOM {
    constructor(html?: string, options?: ConstructorOptions)
    static fromURL(url: string, options?: ConstructorOptions): Promise<JSDOM>
    readonly window: Window & typeof globalThis
  }
}
