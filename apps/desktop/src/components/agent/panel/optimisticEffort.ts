import type {
  SessionConfigPick,
  SessionConfigSelection,
  SessionConfigState,
} from '../../../api/session-config-types'

/** Only preview effort from an already advertised list for the same model. */
export function optimisticEffort(
  data: SessionConfigState | undefined,
  pick: SessionConfigPick,
): SessionConfigSelection | undefined {
  if (!data || !['ready', 'dormant'].includes(data.status)) return
  if (
    data.options.some(
      (option) =>
        option.kind !== 'effort' &&
        pick[option.kind] !== undefined &&
        pick[option.kind] !== option.currentValue,
    )
  )
    return
  const effort = data.options.find((option) => option.kind === 'effort')

  if (
    !effort ||
    !pick.effort ||
    pick.effort === effort.currentValue ||
    !effort.options.some((option) => option.value === pick.effort)
  )
    return

  return { configId: effort.id, value: pick.effort }
}
