import { useState, type ReactNode } from 'react'

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      className={`tip${open ? ' open' : ''}`}
      tabIndex={0}
      title={text}
      onClick={(e) => {
        e.stopPropagation()
        setOpen((v) => !v)
      }}
      onBlur={() => setOpen(false)}
    >
      {children}
      <span className="tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  )
}
