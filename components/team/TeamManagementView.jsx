"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import { cancelTeamInvite, createTeamInvite, fetchTeamWorkspace, removeTeamMember as removeWorkspaceMember, updateTeamMember } from "../../lib/data/team";
import { canManageTeam, parseSiteScope } from "../../lib/permissions/roles";
import { dateLabel, SaasStyles } from "../saas/SaasShared";

export function TeamManagementView({ organizationId, workspaceRole, platformAdmin = false }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [sites, setSites] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canManage = canManageTeam(workspaceRole, platformAdmin);

  async function load() {
    if (!organizationId) return;
    setError("");

    try {
      const workspace = await fetchTeamWorkspace(getSupabaseBrowserClient(), organizationId);
      setCurrentUserId(workspace.currentUserId);
      setMembers(workspace.members);
      setInvites(workspace.invites);
    } catch (e) {
      setError(e?.message || "Could not load team members.");
    }
  }

  useEffect(() => {
    load();
  }, [organizationId]);

  async function invite() {
    if (!canManage || !email.trim()) return;

    setBusy("invite");
    setError("");
    setMessage("");

    try {
      const result = await createTeamInvite(getSupabaseBrowserClient(), {
        organizationId,
        email: email.trim(),
        role,
        siteScope: parseSiteScope(sites),
      });
      setMessage(
        result?.status === "accepted"
          ? "The registered user was added to this workspace."
          : "Invite created. Ask the user to register/sign in with the invited email."
      );

      setEmail("");
      setRole("viewer");
      setSites("");
      await load();
    } catch (e) {
      setError(e?.message || "Could not create the invite.");
    } finally {
      setBusy("");
    }
  }

  function editMember(userId, patch) {
    setMembers((current) => current.map((member) => (
      member.user_id === userId ? { ...member, ...patch } : member
    )));
  }

  async function saveMember(member) {
    setBusy(`save-${member.user_id}`);
    setError("");

    try {
      await updateTeamMember(getSupabaseBrowserClient(), {
        organizationId,
        userId: member.user_id,
        role: member.edit_role,
        siteScope: parseSiteScope(member.edit_sites),
      });
      await load();
    } catch (e) {
      setError(e?.message || "Could not update the team member.");
    } finally {
      setBusy("");
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.full_name || member.email || "this user"} from the workspace?`)) return;

    setBusy(`remove-${member.user_id}`);
    setError("");

    try {
      await removeWorkspaceMember(getSupabaseBrowserClient(), {
        organizationId,
        userId: member.user_id,
      });
      await load();
    } catch (e) {
      setError(e?.message || "Could not remove the team member.");
    } finally {
      setBusy("");
    }
  }

  async function cancelInvite(invite) {
    setBusy(`invite-${invite.token}`);
    setError("");

    try {
      await cancelTeamInvite(getSupabaseBrowserClient(), {
        organizationId,
        token: invite.token,
      });
      await load();
    } catch (e) {
      setError(e?.message || "Could not cancel the invite.");
    } finally {
      setBusy("");
    }
  }

  async function copySignupLink() {
    try {
      await navigator.clipboard.writeText("https://www.metrixiq.co.uk/login");
      setMessage("Signup link copied. The invite is matched automatically by email.");
    } catch {
      setMessage("Signup URL: https://www.metrixiq.co.uk/login");
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="page-kicker">ACCOUNT</span>
          <h1>Team Management</h1>
          <p>Invite managers, dispatchers and viewers into this workspace.</p>
        </div>
      </div>

      {error && <div className="saas-error">{error}</div>}
      {message && <div className="saas-success">{message}</div>}

      <section className="panel team-invite-panel">
        <div className="panel-head">
          <div>
            <h2>Invite a team member</h2>
            <p>Existing accounts are added immediately. New users are linked when they register with the invited email.</p>
          </div>
        </div>

        <div className="team-invite-grid">
          <label>
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@company.co.uk" />
          </label>

          <label>
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="manager">Manager</option>
              <option value="dispatcher">Dispatcher</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>

          <label>
            <span>Site scope</span>
            <input value={sites} onChange={(e) => setSites(e.target.value)} placeholder="DLS2, DXM3 · blank = all sites" />
          </label>

          <button className="saas-primary" disabled={!canManage || busy === "invite"} onClick={invite}>
            {busy === "invite" ? "Inviting…" : "Create invite"}
          </button>
        </div>
      </section>

      <section className="panel team-list-panel">
        <div className="panel-head">
          <div>
            <h2>Workspace team</h2>
            <p>{members.length} member{members.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table team-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Site scope</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const protectedMember = ["owner", "admin"].includes(member.role);
                const isSelf = member.user_id === currentUserId;

                return (
                  <tr key={member.user_id}>
                    <td>
                      <b>{member.full_name || "Unnamed user"}</b>
                      <small className="saas-cell-small">{member.email || "No email"}</small>
                    </td>

                    <td>
                      <select
                        value={member.edit_role}
                        disabled={!canManage || protectedMember}
                        onChange={(e) => editMember(member.user_id, { edit_role: e.target.value })}
                      >
                        {protectedMember && <option value={member.role}>{member.role}</option>}
                        {!protectedMember && <>
                          <option value="manager">Manager</option>
                          <option value="dispatcher">Dispatcher</option>
                          <option value="viewer">Viewer</option>
                        </>}
                      </select>
                    </td>

                    <td>
                      <input
                        value={member.edit_sites}
                        disabled={!canManage || protectedMember}
                        onChange={(e) => editMember(member.user_id, { edit_sites: e.target.value })}
                        placeholder="All sites"
                      />
                    </td>

                    <td>{dateLabel(member.joined_at)}</td>

                    <td>
                      {!protectedMember && (
                        <div className="team-actions">
                          <button
                            className="team-save"
                            disabled={!canManage || busy === `save-${member.user_id}`}
                            onClick={() => saveMember(member)}
                          >
                            Save
                          </button>
                          <button
                            className="team-remove"
                            disabled={!canManage || isSelf || busy === `remove-${member.user_id}`}
                            onClick={() => removeMember(member)}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!members.length && <tr><td colSpan="5">No team members found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel team-pending-panel">
        <div className="panel-head">
          <div>
            <h2>Pending invites</h2>
            <p>Invites expire after 14 days.</p>
          </div>
          <button className="btn ghost" onClick={copySignupLink}>Copy signup link</button>
        </div>

        <div className="team-pending-list">
          {invites.map((invite) => (
            <div key={invite.token}>
              <div>
                <b>{invite.email}</b>
                <small>
                  {invite.role} · {(invite.site_scope || []).length ? invite.site_scope.join(", ") : "All sites"} · expires {dateLabel(invite.expires_at)}
                </small>
              </div>
              <button
                disabled={busy === `invite-${invite.token}`}
                onClick={() => cancelInvite(invite)}
              >
                Cancel
              </button>
            </div>
          ))}

          {!invites.length && <p className="team-empty">No pending invites.</p>}
        </div>
      </section>

      <div className="saas-billing-note">
        <b>Role model</b>
        <p>
          Managers can manage the workspace and team. Dispatchers and viewers receive reduced management navigation.
          Site scope is enforced server-side across driver, scorecard, alert and coaching data. Blank scope means access to all sites.
        </p>
      </div>

      <SaasStyles />
    </>
  );
}


