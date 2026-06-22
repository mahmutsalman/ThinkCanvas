import { useState } from 'react'
import {
  TOKEN_KEYS,
  TOKEN_LABELS,
  setLiveToken,
  isHex6,
  type ThemeTokens
} from '../lib/themes'

type Props = {
  mode: 'create' | 'edit'
  initialName: string
  initialTokens: ThemeTokens
  onSave: (name: string, tokens: ThemeTokens) => void
  onDelete?: () => void
  onCancel: () => void
}

// A floating, non-modal panel: the whole canvas behind it IS the live preview,
// re-skinning in real time as you pick colors (setLiveToken on every change).
export default function ThemeEditor({
  mode,
  initialName,
  initialTokens,
  onSave,
  onDelete,
  onCancel
}: Props): JSX.Element {
  const [name, setName] = useState(initialName)
  const [tokens, setTokens] = useState<ThemeTokens>(initialTokens)

  const update = (key: keyof ThemeTokens, value: string): void => {
    setTokens((t) => ({ ...t, [key]: value }))
    if (isHex6(value)) setLiveToken(key, value) // live-preview the whole app
  }

  return (
    <div className="tc-themed">
      <div className="tc-themed__head">
        <span className="tc-themed__title">{mode === 'edit' ? 'Edit theme' : 'New theme'}</span>
        <span className="tc-themed__sub">live preview</span>
        <div className="tc-themed__spacer" />
        <button className="tc-themed__x" onClick={onCancel} title="Cancel (discard)">
          ✕
        </button>
      </div>

      <input
        className="tc-themed__name"
        value={name}
        spellCheck={false}
        placeholder="Theme name"
        onChange={(e) => setName(e.target.value)}
      />

      <div className="tc-themed__tokens">
        {TOKEN_KEYS.map((key) => (
          <div className="tc-themed__row" key={key}>
            <span className="tc-themed__label">{TOKEN_LABELS[key]}</span>
            <input
              className="tc-themed__swatch"
              type="color"
              value={isHex6(tokens[key]) ? tokens[key] : '#000000'}
              onChange={(e) => update(key, e.target.value)}
            />
            <input
              className="tc-themed__hex"
              value={tokens[key]}
              spellCheck={false}
              onChange={(e) => update(key, e.target.value.trim())}
            />
          </div>
        ))}
      </div>

      <div className="tc-themed__foot">
        {onDelete && (
          <button className="tc-themed__del" onClick={onDelete} title="Delete this theme">
            Delete
          </button>
        )}
        <div className="tc-themed__spacer" />
        <button className="tc-themed__cancel" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="tc-themed__save"
          onClick={() => onSave(name.trim() || 'My theme', tokens)}
        >
          Save
        </button>
      </div>
    </div>
  )
}
