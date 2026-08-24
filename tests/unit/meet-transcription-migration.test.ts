import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const path = 'supabase/migrations/20260824194355_create_meet_transcription_foundation.sql'

describe('Meet transcription local migration', () => {
  it('creates the normalized private Phase 1 model with 15-day retention', () => {
    const sql = readFileSync(path, 'utf8').toLowerCase()
    expect(sql).toContain('create table if not exists public.meet_transcripts')
    expect(sql).toContain('create table if not exists public.meet_transcript_consents')
    expect(sql).toContain('create table if not exists public.meet_transcript_segments')
    expect(sql).toContain("now() + interval '15 days'")
    expect(sql).toContain('original_text text not null')
    expect(sql).toContain('livekit_participant_identity text not null')
    expect(sql).toContain('meet_transcript_segments_provider_segment_idx')
    expect(sql).not.toMatch(/audio_(data|url|key|bytes)/)
  })

  it('enables member-scoped RLS and creates no browser write policy', () => {
    const sql = readFileSync(path, 'utf8').toLowerCase()
    expect(sql.match(/enable row level security/g)).toHaveLength(3)
    expect(sql.match(/member\.status = 'approved'/g)).toHaveLength(3)
    expect(sql).not.toMatch(/create policy[\s\S]{0,250}for insert/)
    expect(sql).not.toMatch(/create policy[\s\S]{0,250}for update/)
    expect(sql).not.toMatch(/create policy[\s\S]{0,250}for delete/)
    expect(sql.match(/retention_expires_at > now\(\)/g)).toHaveLength(3)
    expect(sql).toContain('revoke all privileges on table public.meet_transcripts from anon, authenticated')
    expect(sql).toContain('grant select on table public.meet_transcript_segments to authenticated')
  })

  it('enforces canonical transcript/room/member/user relationships in PostgreSQL', () => {
    const sql = readFileSync(path, 'utf8').toLowerCase()
    expect(sql).toContain('unique (id, room_id)')
    expect(sql).toContain('on public.meet_room_members(id, room_id, user_id)')
    expect(sql.match(/foreign key \(transcript_id, room_id\)/g)).toHaveLength(2)
    expect(sql.match(/references public\.meet_transcripts\(id, room_id\)/g)).toHaveLength(2)
    expect(sql.match(/foreign key \(member_id, room_id, user_id\)/g)).toHaveLength(2)
    expect(sql.match(/references public\.meet_room_members\(id, room_id, user_id\)/g)).toHaveLength(2)
  })

  it('blocks reads after retention expiry through the canonical parent transcript', () => {
    const sql = readFileSync(path, 'utf8').toLowerCase()
    const policyStart = sql.indexOf('create policy "approved members can read meet transcript consents"')
    const segmentPolicyStart = sql.indexOf('create policy "approved members can read meet transcript segments"')
    const consentsPolicy = sql.slice(policyStart, segmentPolicyStart)
    const segmentsPolicy = sql.slice(segmentPolicyStart)
    expect(consentsPolicy).toContain('from public.meet_transcripts transcript')
    expect(consentsPolicy).toContain('transcript.retention_expires_at > now()')
    expect(segmentsPolicy).toContain('from public.meet_transcripts transcript')
    expect(segmentsPolicy).toContain('transcript.retention_expires_at > now()')
    expect(sql).toContain('ended_at >= started_at')
  })
})
