import clsx from 'clsx'
import { Camera } from 'lucide-react'
import { useRef, useState } from 'react'

import { api } from '../../api'
import { Avatar } from '../../components/Avatar'
import { Button } from '../../components/ui/button'
import { toast } from '../../components/ui/toast'
import { trustedAvatarURL } from '../../lib/avatarUrl'

import { AvatarCropDialog } from './AvatarCropDialog'

import type { UserInfo } from '../../types'
import type { DragEvent } from 'react'

const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
// The crop dialog downsizes before upload, so this only guards against huge files.
const MAX_SOURCE_BYTES = 25 * 1024 * 1024

function validatePhoto(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return 'Choose a PNG, JPEG or WebP image.'
  if (file.size > MAX_SOURCE_BYTES) return 'Choose an image under 25 MB.'

  return null
}

/** Personal photo uses the same picker as workspace icons. */
export function ProfilePhoto({
  user,
  displayName,
  onUserUpdated,
}: {
  user: UserInfo
  displayName: string
  onUserUpdated: (user: UserInfo) => void
}) {
  return (
    <PhotoUpload
      imageURL={trustedAvatarURL(user.avatarURL)}
      hasPhoto={Boolean(user.avatarURL)}
      displayName={displayName}
      onUpload={async (image) => onUserUpdated(await api.authUploadAvatar(image))}
      onRemove={async () => onUserUpdated(await api.authRemoveAvatar())}
    />
  )
}

export function PhotoUpload({
  imageURL,
  hasPhoto,
  displayName,
  onUpload,
  onRemove,
  square = false,
  disabled = false,
  onBusyChange,
}: {
  imageURL: string | undefined
  hasPhoto: boolean
  displayName: string
  onUpload: (image: Uint8Array) => Promise<void>
  onRemove: () => Promise<void>
  square?: boolean
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const unavailable = disabled || photoBusy
  const rounded = square ? 'rounded-lg' : 'rounded-full'

  function pickPhoto(file: File | undefined) {
    if (!file || unavailable) return
    const problem = validatePhoto(file)

    setPhotoError(problem)
    if (!problem) setPhoto(file)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    pickPhoto(event.dataTransfer.files[0])
  }

  async function uploadPhoto(image: Uint8Array) {
    onBusyChange?.(true)
    try {
      await onUpload(image)
    } finally {
      onBusyChange?.(false)
    }
  }

  async function removePhoto() {
    setPhotoBusy(true)
    onBusyChange?.(true)
    setPhotoError(null)
    try {
      await onRemove()
    } catch (err) {
      toast.apiError('Could not remove photo', err)
    } finally {
      setPhotoBusy(false)
      onBusyChange?.(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Change photo"
          disabled={unavailable}
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={clsx(
            'group relative outline-none focus-visible:ring-2 focus-visible:ring-zViolet-500',
            rounded,
            dragging && 'ring-2 ring-zViolet-500 ring-offset-2 ring-offset-zGray-900',
          )}
        >
          <Avatar
            src={imageURL}
            name={displayName}
            size={64}
            className={clsx(rounded, '!shadow-none')}
          />
          <span
            className={clsx(
              'absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/70 text-[10px] backdrop-blur-[2px] font-medium leading-tight text-white transition-opacity',
              rounded,
              dragging
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            <Camera className="h-3.5 w-3.5" />
            {dragging ? 'Drop photo' : 'Change photo'}
          </span>
        </button>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={unavailable}
              onClick={() => fileInput.current?.click()}
            >
              Upload photo
            </Button>
            {hasPhoto && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={unavailable}
                onClick={() => void removePhoto()}
              >
                {photoBusy ? 'Removing…' : 'Remove photo'}
              </Button>
            )}
          </div>
          <p className="text-[12px] text-tertiary">
            PNG, JPEG or WebP. Drop an image on the avatar.
          </p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={PHOTO_TYPES.join(',')}
          className="hidden"
          onChange={(event) => {
            pickPhoto(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </div>
      {photoError && (
        <p role="alert" className="text-sm text-red-400">
          {photoError}
        </p>
      )}
      {photo && (
        <AvatarCropDialog
          square={square}
          file={photo}
          onSave={uploadPhoto}
          onClose={() => setPhoto(null)}
        />
      )}
    </>
  )
}
