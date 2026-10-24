"use client";

import { useState } from "react";

import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import {
  archiveProjectAction,
  deleteProjectAction,
  updateProjectAction,
} from "@/app/actions/projects";

export function UpdateProjectForm({
  workspaceId,
  projectId,
  name,
  description,
  annotationMode,
  annotationsPerTask,
  tasksExist,
}: {
  workspaceId: string;
  projectId: string;
  name: string;
  description: string;
  annotationMode: "SINGLE" | "MULTI";
  annotationsPerTask: number;
  tasksExist: boolean;
}) {
  const [mode, setMode] = useState(annotationMode);
  return (
    <ActionForm action={updateProjectAction} className="form-grid">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="form-grid two">
        <div className="field">
          <label htmlFor="edit-project-name">Project name</label>
          <input
            className="input"
            id="edit-project-name"
            name="name"
            required
            minLength={2}
            maxLength={120}
            defaultValue={name}
          />
        </div>
        <div className="field">
          <label htmlFor="edit-project-mode">Annotation mode</label>
          {tasksExist ? (
            <>
              <input type="hidden" name="annotationMode" value={annotationMode} />
              <input
                type="hidden"
                name="annotationsPerTask"
                value={String(annotationsPerTask)}
              />
              <input
                className="input"
                id="edit-project-mode"
                value={annotationMode === "MULTI" ? "Multi-annotator" : "Single annotator"}
                readOnly
                aria-describedby="edit-project-mode-hint"
              />
              <p className="field-hint" id="edit-project-mode-hint">
                Mode and required annotations are locked because tasks exist.
              </p>
            </>
          ) : (
            <>
              <select
                className="select"
                id="edit-project-mode"
                name="annotationMode"
                value={mode}
                onChange={(event) => setMode(event.target.value as "SINGLE" | "MULTI")}
              >
                <option value="SINGLE">Single annotator</option>
                <option value="MULTI">Multi-annotator</option>
              </select>
              <div className="field" style={{ marginTop: "0.5rem" }}>
                <label htmlFor="edit-project-per-task" className="field-hint">
                  Required annotations per task
                </label>
                <select
                  className="select"
                  id="edit-project-per-task"
                  name="annotationsPerTask"
                  defaultValue={mode === "SINGLE" ? "1" : String(Math.max(2, annotationsPerTask))}
                  key={mode}
                >
                  {mode === "SINGLE" ? <option value="1">1</option> : null}
                  {mode === "MULTI" ? (
                    <>
                      <option value="2">2</option>
                      <option value="3">3</option>
                    </>
                  ) : null}
                </select>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="field">
        <label htmlFor="edit-project-description">Description</label>
        <textarea
          className="textarea"
          id="edit-project-description"
          name="description"
          maxLength={1000}
          defaultValue={description}
        />
      </div>
      <div>
        <SubmitButton className="btn btn-secondary" pendingLabel="Saving...">
          Save project settings
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ArchiveProjectForm({
  workspaceId,
  projectId,
  archived,
}: {
  workspaceId: string;
  projectId: string;
  archived: boolean;
}) {
  return (
    <ActionForm action={archiveProjectAction} className="stack">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="archived" value={archived ? "false" : "true"} />
      <SubmitButton className="btn btn-secondary btn-sm" pendingLabel="Updating...">
        {archived ? "Restore project" : "Archive project"}
      </SubmitButton>
    </ActionForm>
  );
}

export function DeleteProjectForm({
  workspaceId,
  projectId,
  name,
}: {
  workspaceId: string;
  projectId: string;
  name: string;
}) {
  return (
    <ActionForm action={deleteProjectAction} className="stack">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="field">
        <label htmlFor="delete-project">
          Type <span className="mono">{name}</span> to confirm
        </label>
        <input
          className="input"
          id="delete-project"
          name="confirmation"
          required
          autoComplete="off"
        />
      </div>
      <SubmitButton className="btn btn-danger" pendingLabel="Deleting...">
        Permanently delete project
      </SubmitButton>
    </ActionForm>
  );
}
