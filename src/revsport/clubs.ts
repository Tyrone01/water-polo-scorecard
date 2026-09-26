/** Association hubs on Revolutionise Sport. Grade listings live under each /games page. */
export const REVSPORT_CLUBS = [
  {
    id: 'AJWP',
    name: 'Alstonville Junior Water Polo',
    url: 'https://www.revolutionise.com.au/ajwp/games',
  },
  {
    id: 'FNC',
    name: 'Far North Coast Waterpolo',
    url: 'https://www.fncwaterpolo.org.au/games',
  },
  {
    id: 'QWP',
    name: 'Water Polo Queensland',
    url: 'https://www.waterpoloqld.com.au/games',
  },
  {
    id: 'NSWWP',
    name: 'Water Polo NSW',
    url: 'https://www.waterpolonsw.org.au/games',
  },
] as const

export type RevSportClubId = (typeof REVSPORT_CLUBS)[number]['id']

export function clubIdFromUrl(url: string): RevSportClubId | '' {
  const raw = url.trim()
  const hit = REVSPORT_CLUBS.find((c) => raw === c.url || raw.startsWith(c.url + '/'))
  return hit?.id ?? ''
}
