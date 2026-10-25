import { exportEventLog, exportPlayerSummary, exportResults } from '../csv'
import { driveSavePanelModel } from '../driveSavePanel'
import { resolveDriveTarget, venueHintFor } from '../driveTarget'
import { googleSessionEmail, hasGoogleSession } from '../googleAuth'
import { loadAdmin } from '../storage'
import type { Match } from '../types'

interface Props {
  match: Match
  onSave: () => void
  onClear: () => void
}

export function DriveSavePanel({ match, onSave, onClear }: Props) {
  const admin = loadAdmin()
  const model = driveSavePanelModel({
    save: match.driveSave,
    email: googleSessionEmail() || match.driveSave?.accountEmail || admin.lastEmail,
    connected: hasGoogleSession(),
    target: resolveDriveTarget(admin, venueHintFor(match)),
  })

  return (
    <section className={`drive-save ${model.tone}`} data-drive-status={model.tone} aria-live="polite">
      <div className="drive-save-copy">
        <strong className="drive-save-heading">{model.heading}</strong>
        <p className="drive-save-meta">{model.accountLine}</p>
        <p className="drive-save-meta">
          <a href={model.folderUrl} target="_blank" rel="noreferrer">{model.folderLine}</a>
        </p>
        {model.folderNote ? <p className="drive-save-note">{model.folderNote}</p> : null}
        <p className="drive-save-detail">{model.detail}</p>
        {model.logUrl || model.summaryUrl ? (
          <p className="drive-save-links">
            {model.logUrl ? <a href={model.logUrl} target="_blank" rel="noreferrer">Event log</a> : null}
            {model.logUrl && model.summaryUrl ? ' · ' : null}
            {model.summaryUrl ? <a href={model.summaryUrl} target="_blank" rel="noreferrer">Player summary</a> : null}
          </p>
        ) : null}
      </div>
      <div className="drive-save-actions">
        {model.primaryLabel ? (
          <button className="btn primary drive-save-go" type="button" disabled={model.primaryDisabled} onClick={onSave}>
            {model.primaryLabel}
          </button>
        ) : null}
        {model.showSaveAgain ? (
          <button className="btn" type="button" onClick={onSave}>Save again</button>
        ) : null}
        <button
          className="btn"
          type="button"
          title="A file for an FNC admin to type the result into RevSport. Nothing is sent to RevSport."
          onClick={() => exportResults(match)}
        >
          Results for RevSport (CSV)
        </button>
        {model.tone === 'error' ? (
          <>
            <button className="btn" type="button" onClick={() => exportEventLog(match)}>Download event log</button>
            <button className="btn" type="button" onClick={() => exportPlayerSummary(match)}>Download player summary</button>
          </>
        ) : null}
        <button className="btn primary" type="button" disabled={!model.clearEnabled} onClick={onClear}>
          Clear for next game
        </button>
        {model.showSkipClear ? (
          <button
            className="btn small"
            type="button"
            onClick={() => {
              if (window.confirm('Clear this game without a Drive copy? Download the CSVs first if you still need a file.')) onClear()
            }}
          >
            Clear without a Drive copy
          </button>
        ) : null}
      </div>
      {model.clearHint ? <p className="drive-save-note">{model.clearHint}</p> : null}
    </section>
  )
}
