/** @file MonteCarlo preset example card */

export function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="toolbar-btn" onClick={onClick}>
      {label}
    </button>
  );
}

export function PresetsCard({ presets }: { presets: { label: string; onClick: () => void }[] }) {
  return (
    <div className="bt-seo-card card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>预设示例</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {presets.map((preset) => (
          <PresetButton key={preset.label} label={preset.label} onClick={preset.onClick} />
        ))}
      </div>
    </div>
  );
}
