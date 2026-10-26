export default function WorkspaceLoading() {
  return (
    <main id="main-content" className="page" aria-busy="true" aria-live="polite">
      <div className="container stack-lg">
        <p className="eyebrow">Loading</p>
        <div className="card card-pad stack">
          <div className="progress-track" style={{ width: "18rem", maxWidth: "100%" }}>
            <div className="progress-fill" style={{ width: "45%" }} />
          </div>
          <p className="small muted">Loading workspace data...</p>
        </div>
      </div>
    </main>
  );
}
