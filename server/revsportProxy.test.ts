import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { listingFollowUrl } from './revsportProxy'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures')
const listing = readFileSync(path.join(fixtures, 'ajwp-games-listing.html'), 'utf8')
const round1 = readFileSync(path.join(fixtures, 'ajwp-games-round1.html'), 'utf8')
const page = 'https://www.revolutionise.com.au/ajwp/games/24352/3690'

describe('listingFollowUrl', () => {
  it('follows a grade listing to the next upcoming round', () => {
    const follow = listingFollowUrl(listing, page, '2026-08-28')
    expect(follow).toMatch(/\/round\/1$/)
  })

  it('does not follow a round page that already has games', () => {
    expect(listingFollowUrl(round1, page + '/round/1', '2026-08-28')).toBeNull()
  })
})
