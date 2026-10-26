import { faCheck, faCopy } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import clsx from 'clsx'
import { useState } from 'react'

import { api } from '../../api'
import { Button } from '../../components/ui/button'
import { toast } from '../../components/ui/toast'

import { AllowedEmailDomainCard } from './AllowedEmailDomainCard'
import { DangerZone } from './DangerZone'
import { LocalAgentSharingCeilingCard } from './LocalAgentSharingCeilingCard'
import { PhotoUpload } from './ProfilePhoto'
import { Field, SectionHeader } from './shared'
import { inputClasses } from './styles'

import type { AtlasTeam } from '../../types'
import type { FormEvent } from 'react'

// Click-to-copy team id — needed verbatim for things like the AWS role trust
// policy's `sub` condition, so make it copyable instead of select-and-drag.
function CopyableTeamId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Local clipboard failure — never an atlas error, so hand-author it.
      toast.error('Could not copy team ID', 'Clipboard was blocked.')
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="Copy team ID"
      className="group flex items-center gap-1.5 min-w-0 max-w-full text-[12.5px] text-tertiary hover:text-secondary transition-colors"
    >
      <span className="truncate font-mono">{id}</span>
      <FontAwesomeIcon
        icon={copied ? faCheck : faCopy}
        className={clsx(
          'w-3 h-3 flex-shrink-0',
          copied ? 'text-zViolet-accent' : 'opacity-0 group-hover:opacity-100 transition-opacity',
        )}
      />
    </button>
  )
}

export function GeneralSection({
  team,
  userEmail,
  onTeamUpdated,
  onTeamRemoved,
}: {
  team: AtlasTeam | undefined
  userEmail: string
  onTeamUpdated: (team: AtlasTeam) => void
  onTeamRemoved: (teamId: string) => void
}) {
  const [name, setName] = useState(team?.name ?? '')
  const [icon, setIcon] = useState(team?.avatarUrl ?? '')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const canEdit = team?.isOwner || team?.role === 'ADMINISTRATOR' || team?.role === 'EDITOR'

  const dirty = team
    ? name.trim() !== (team.name ?? '') || icon.trim() !== (team.avatarUrl ?? '')
    : false

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmedName = name.trim()

    if (!team || !trimmedName || submitting || photoBusy) return
    setSubmitting(true)
    try {
      const updated = await api.atlasUpdateTeam(team.id, {
        name: trimmedName,
        avatarUrl: icon.trim(),
      })

      onTeamUpdated(updated)
      toast.success('Workspace updated')
    } catch (err) {
      toast.apiError('Could not update workspace', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <SectionHeader title="General" description="Manage your workspace's name and icon." />
      {team ? (
        <>
          <form onSubmit={(e) => void submit(e)} className="space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              <PhotoUpload
                square
                imageURL={icon || undefined}
                hasPhoto={Boolean(icon)}
                displayName={name || team.name}
                disabled={!canEdit || submitting}
                onBusyChange={setPhotoBusy}
                onUpload={async (image) => {
                  const updated = await api.atlasUploadTeamAvatar(team.id, image)

                  setIcon(updated.avatarUrl ?? '')
                  onTeamUpdated(updated)
                }}
                onRemove={async () => {
                  const updated = await api.atlasUpdateTeam(team.id, { avatarUrl: '' })

                  setIcon('')
                  onTeamUpdated(updated)
                }}
              />
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-main truncate">
                  {name || team.name || 'Workspace'}
                </div>
                <CopyableTeamId id={team.id} />
              </div>
            </div>

            <Field label="Name">
              <input
                type="text"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClasses}
              />
            </Field>

            <Field label="Icon URL" hint="A square image works best.">
              <input
                type="url"
                disabled={submitting || photoBusy}
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="https://example.com/icon.png"
                className={inputClasses}
              />
            </Field>

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                type="submit"
                disabled={!name.trim() || !dirty || submitting || photoBusy}
              >
                {submitting ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </form>

          <AllowedEmailDomainCard team={team} userEmail={userEmail} onTeamUpdated={onTeamUpdated} />
          <LocalAgentSharingCeilingCard team={team} onTeamUpdated={onTeamUpdated} />

          <DangerZone team={team} onTeamRemoved={onTeamRemoved} />
        </>
      ) : (
        <div className="text-[13px] text-tertiary">No workspace selected.</div>
      )}
    </div>
  )
}
