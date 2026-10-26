export default function ProjectLoading() {
  return (
    <main id="main-content" className="page container-narrow" aria-busy="true" aria-live="polite">
      <div className="empty-state">
        <p className="eyebrow">Loading project</p>
        <h1 className="display-sm">Opening the project data</h1>
        <p className="small muted">
          Loading dataset versions, schemas, tasks, and review state.
        </p>
      </div>
    </main>
  );
}
