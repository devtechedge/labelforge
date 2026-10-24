"use client";

import { useState } from "react";

import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import {
  createWorkspaceAction,
  inviteMemberAction,
  removeMemberAction,
  updateMemberRolesAction,
  renameWorkspaceAction,
  deleteWorkspaceAction,
} from "@/app/actions/workspaces";
import { createProjectAction } from "@/app/actions/projects";

export function CreateWorkspaceForm() {
  return (
    <ActionForm action={createWorkspaceAction} className="stack">
      <div className="field">
        <label htmlFor="workspace-name">Workspace name</label>
        <input
          className="input"
          id="workspace-name"
          name="name"
          required
          minLength={2}
          maxLength={80}
          placeholder="Example: Meridian Review Lab"
        />
      </div>
      <SubmitButton pendingLabel="Creating...">Create workspace</SubmitButton>
    </ActionForm>
  );
}

function ProjectModeFields() {
  const [mode, setMode] = useState<"SINGLE" | "MULTI">("SINGLE");
  const [perTask, setPerTask] = useState("1");
  return (
    <>
      <fieldset className="field">
        <legend className="field-label">Annotation mode</legend>
        <div className="grid-2" style={{ marginTop: "0.4rem" }}>
          <label className="choice-card">
            <input
              type="radio"
              name="annotationMode"
              value="SINGLE"
              checked={mode === "SINGLE"}
              onChange={() => {
                setMode("SINGLE");
                setPerTask("1");
              }}
            />
            <span>
              <strong>Single annotator</strong>
              <span>One active assignment per task.</span>
            </span>
          </label>
          <label className="choice-card">
            <input
              type="radio"
              name="annotationMode"
              value="MULTI"
              checked={mode === "MULTI"}
              onChange={() => {
                setMode("MULTI");
                setPerTask("2");
              }}
            />
            <span>
              <strong>Multi-annotator</strong>
              <span>Independent answers for agreement checks.</span>
            </span>
          </label>
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="annotations-per-task">Required annotations per task</label>
        <select
          className="select"
          id="annotations-per-task"
          name="annotationsPerTask"
          value={perTask}
          onChange={(event) => setPerTask(event.target.value)}
          disabled={mode === "SINGLE"}
        >
          {mode === "SINGLE" ? <option value="1">1</option> : null}
          {mode === "MULTI" ? (
            <>
              <option value="2">2</option>
              <option value="3">3</option>
            </>
          ) : null}
        </select>
        <p className="field-hint">
          This policy is fixed after tasks are generated. Use two or three
          independent annotators to support agreement measures.
        </p>
      </div>
    </>
  );
}

export function CreateProjectForm({ workspaceId }: { workspaceId: string }) {
  return (
    <ActionForm action={createProjectAction}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="field">
        <label htmlFor="project-name">Project name</label>
        <input
          className="input"
          id="project-name"
          name="name"
          required
          minLength={2}
          maxLength={120}
        />
      </div>
      <div className="field">
        <label htmlFor="project-description">Description</label>
        <textarea
          className="textarea"
          id="project-description"
          name="description"
          maxLength={1000}
          placeholder="What decision should this dataset support?"
        />
      </div>
      <ProjectModeFields />
      <SubmitButton pendingLabel="Creating project...">
        Create project
      </SubmitButton>
    </ActionForm>
  );
}

export function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  return (
    <ActionForm action={inviteMemberAction} className="stack">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="field">
        <label htmlFor="invite-email">Email address</label>
        <input
          className="input"
          id="invite-email"
          name="email"
          type="email"
          required
          maxLength={254}
          placeholder="teammate@example.com"
        />
      </div>
      <fieldset className="field">
        <legend className="field-label">Roles</legend>
        <label className="check-row">
          <input type="checkbox" name="roles" value="ANNOTATOR" defaultChecked />
          <span>
            <strong>Annotator.</strong> Work on assigned tasks only.
          </span>
        </label>
        <label className="check-row">
          <input type="checkbox" name="roles" value="REVIEWER" />
          <span>
            <strong>Reviewer.</strong> Decide reviews and adjudicate disputes.
          </span>
        </label>
        <label className="check-row">
          <input type="checkbox" name="roles" value="MANAGER" />
          <span>
            <strong>Manager.</strong> Administer projects, imports, assignments,
            and releases.
          </span>
        </label>
      </fieldset>
      <p className="field-hint">
        Invitations expire after seven days. No invitation email is sent on this
        deployment; copy the one-time link after creating it.
      </p>
      <SubmitButton pendingLabel="Creating invitation...">
        Create invitation
      </SubmitButton>
    </ActionForm>
  );
}

export function MemberRoleForm({
  workspaceId,
  membershipId,
  roles,
}: {
  workspaceId: string;
  membershipId: string;
  roles: string[];
}) {
  return (
    <ActionForm action={updateMemberRolesAction} className="stack" formId={`roles-${membershipId}`}>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <fieldset>
        <legend className="sr-only">Roles</legend>
        <div className="role-pills">
          {(["MANAGER", "REVIEWER", "ANNOTATOR"] as const).map((role) => (
            <label key={role} className="check-row" style={{ padding: 0 }}>
              <input
                type="checkbox"
                name="roles"
                value={role}
                defaultChecked={roles.includes(role)}
              />
              <span className="tiny">{role.toLowerCase()}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton className="btn btn-secondary btn-sm" pendingLabel="Saving...">
        Save roles
      </SubmitButton>
    </ActionForm>
  );
}

export function RemoveMemberForm({
  workspaceId,
  membershipId,
  name,
}: {
  workspaceId: string;
  membershipId: string;
  name: string;
}) {
  return (
    <ActionForm action={removeMemberAction} className="stack">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="Removing...">
        Remove {name}
      </SubmitButton>
    </ActionForm>
  );
}

export function RenameWorkspaceForm({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  return (
    <ActionForm action={renameWorkspaceAction} className="stack">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="field">
        <label htmlFor="rename-workspace">Workspace name</label>
        <input
          className="input"
          id="rename-workspace"
          name="name"
          required
          minLength={2}
          maxLength={80}
          defaultValue={name}
        />
      </div>
      <SubmitButton className="btn btn-secondary" pendingLabel="Saving...">
        Save name
      </SubmitButton>
    </ActionForm>
  );
}

export function DeleteWorkspaceForm({
  workspaceId,
  slug,
}: {
  workspaceId: string;
  slug: string;
}) {
  return (
    <ActionForm action={deleteWorkspaceAction} className="stack">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="field">
        <label htmlFor="delete-workspace">
          Type <span className="mono">{slug}</span> to confirm
        </label>
        <input
          className="input"
          id="delete-workspace"
          name="confirmation"
          required
          autoComplete="off"
        />
      </div>
      <SubmitButton className="btn btn-danger" pendingLabel="Deleting...">
        Permanently delete workspace
      </SubmitButton>
    </ActionForm>
  );
}
