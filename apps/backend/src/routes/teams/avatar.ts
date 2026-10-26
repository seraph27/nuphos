import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'

import type { TeamAuthVariables } from '@/middleware/auth'
import type { Hono } from 'hono'

import { AppError } from '@/lib/errors'
import { updateTeam } from '@/lib/identity'
import { MAX_AVATAR_UPLOAD_BYTES, storeAvatar, pruneAvatars } from '@/lib/identity/avatar-upload'
import { zv } from '@/lib/validate'
import { requireTeamRole } from '@/middleware/auth'

const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    avatarUrl: z.string().trim().max(2048).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.avatarUrl !== undefined, {
    message: 'At least one field is required',
  })

export function registerTeamAvatarRoutes(teamScoped: Hono<{ Variables: TeamAuthVariables }>) {
  teamScoped.patch(
    '/',
    requireTeamRole('ADMINISTRATOR', 'EDITOR'),
    zv('json', updateTeamSchema),
    async (c) => {
      const input = c.req.valid('json')
      const team = await updateTeam(c.get('teamId'), c.get('userId'), input)

      if (!team) {
        throw new AppError(404, 'team_not_found', 'Team not found')
      }

      if (input.avatarUrl !== undefined) await pruneAvatars(c.get('teamId'))

      return c.json({
        ...team,
        isOwner: team.ownerID === c.get('userId'),
        role: c.get('teamRole'),
      })
    },
  )

  teamScoped.post(
    '/avatar',
    requireTeamRole('ADMINISTRATOR', 'EDITOR'),
    bodyLimit({
      maxSize: MAX_AVATAR_UPLOAD_BYTES + 16_384,
      onError: () => {
        throw new AppError(413, 'avatar_too_large', 'Use an image under 2 MB')
      },
    }),
    async (c) => {
      const form = await c.req.parseBody()

      if (!(form.file instanceof File))
        throw new AppError(400, 'invalid_avatar_image', 'Choose a photo to upload')
      const avatarUrl = await storeAvatar(
        c.get('teamId'),
        new Uint8Array(await form.file.arrayBuffer()),
      )
      const team = await updateTeam(c.get('teamId'), c.get('userId'), { avatarUrl })

      if (!team) throw new AppError(404, 'team_not_found', 'Team not found')
      await pruneAvatars(c.get('teamId'))

      return c.json({ ...team, isOwner: team.ownerID === c.get('userId'), role: c.get('teamRole') })
    },
  )
}
