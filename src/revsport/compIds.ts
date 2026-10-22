/**
 * Which RevSport competitions each club's live sync loads, by competition ID only.
 * Never by name: a real team or grade called "Test" or "Practice" still shows.
 *
 * - `allow`: when set, only these competition IDs load. Any other ID is held
 *   back with a plain-English note until someone adds it here.
 * - `exclude`: always skipped (e.g. practice comps published by mistake).
 * Clubs with no entry load everything (AJWP, WPQ, NSW keep working as before).
 */
import type { RevSportClubId } from './clubs'

export interface CompRule {
  allow?: readonly string[]
  exclude?: readonly string[]
}

export const COMP_RULES: Partial<Record<RevSportClubId, CompRule>> = {
  FNC: {
    // 27800 "FNC" — 2026/27 season (grades FNC, WOMENS, b grade ladies, FNC B).
    // 27655 FNC Socials — kept listed (Tyrone, 23 Oct 2026).
    allow: ['27800', '27655'],
  },
}

export type CompDecision = 'load' | 'excluded' | 'not-listed'

export function compDecision(club: RevSportClubId | '', competitionId: string | undefined): CompDecision {
  const rule = club ? COMP_RULES[club] : undefined
  if (!rule) return 'load'
  const id = (competitionId || '').trim()
  if (id && rule.exclude?.includes(id)) return 'excluded'
  if (rule.allow) return id && rule.allow.includes(id) ? 'load' : 'not-listed'
  return 'load'
}

export function compDecisionNote(decision: CompDecision, competitionId: string | undefined, label: string): string {
  const id = competitionId || 'unknown'
  if (decision === 'excluded') return `Skipped ${label} (RevSport competition ${id} is a practice competition).`
  if (decision === 'not-listed') {
    return `Held back ${label}: RevSport competition ${id} is new and is not on the scorecard's list yet.`
  }
  return ''
}
