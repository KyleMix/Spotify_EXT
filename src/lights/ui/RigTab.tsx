import { useState } from 'react';
import type { LightEngine } from '../engine';
import {
  dipSwitches, displayAddress, footprint, lastChannel, modeOf, profileOf, rigIssues, MAX_FIXTURES,
  type PatchedFixture, type RigIssue,
} from '../patch';
import { BUILT_IN_PROFILES, pixelCount, type FixtureProfile } from '../profiles';
import { useEngine } from './useEngine';
import { ProfileEditor } from './ProfileEditor';

const nameOf = (f: PatchedFixture, i: number) => f.name.trim() || `Light ${i + 1}`;

/** How to set the start address on the light itself: its display reading, or which DIP switches go on. */
function AddressOnLight({ profile, address }: { profile?: FixtureProfile; address: number }) {
  if (profile?.addressing !== 'dip') return <span>Set the light's display to <kbd>{displayAddress(address)}</kbd></span>;
  const on = dipSwitches(address);
  return (
    <span className="row wrap gap-2" aria-label={`DIP switches on: ${on.join(', ')}`}>
      <span>DIP switches ON:</span>
      <span className="dip" aria-hidden="true">
        {Array.from({ length: address >= 512 ? 10 : 9 }, (_, i) => (
          <span key={i} className={`dip-sw${on.includes(i + 1) ? ' on' : ''}`} title={`Switch ${i + 1} (${2 ** i})`}>{i + 1}</span>
        ))}
      </span>
      <span className="muted">{on.join(' + ')} (all others OFF{address < 512 ? '; switch 10, if there is one, usually picks the mode: check the label' : ''})</span>
    </span>
  );
}

function issueText(issue: RigIssue, names: Record<string, string>): string {
  if (issue.kind === 'overlap') return `${names[issue.a]} and ${names[issue.b]} both use channels ${issue.from}–${issue.to}. Move one of them (on the light and here).`;
  if (issue.kind === 'past512') return `${names[issue.id]} runs past channel 512. Give it a lower start address.`;
  return `${names[issue.id]} uses a light type that no longer exists. Pick its type again.`;
}

export function RigTab({ engine, onTest }: { engine: LightEngine; onTest: (fixtureId: string) => void }) {
  useEngine(engine);
  const { rig } = engine;
  const profiles = engine.profiles;
  const [addProfile, setAddProfile] = useState(BUILT_IN_PROFILES[0].id);
  const [addMode, setAddMode] = useState(BUILT_IN_PROFILES[0].modes[0].id);
  const [editing, setEditing] = useState<Partial<FixtureProfile> | null>(null);

  const issues = rigIssues(rig);
  const names = Object.fromEntries(rig.fixtures.map((f, i) => [f.id, nameOf(f, i)]));
  const addProfileObj = profiles.find((p) => p.id === addProfile) ?? profiles[0];

  if (editing) {
    return <ProfileEditor engine={engine} initial={editing} onDone={() => setEditing(null)} />;
  }

  return (
    <>
      <div className="card mb-3">
        <h2 className="m-0">Lights on the chain ({rig.fixtures.length})</h2>
        <p className="muted mt-2 mb-0">
          Cable from the computer into the first light's <kbd>DMX IN</kbd>, its <kbd>DMX OUT</kbd> into the next light's
          <kbd>DMX IN</kbd>, and so on. The order of the cable doesn't matter; each light only listens to its own channels,
          so every light needs its own start address and the ranges must not overlap.
        </p>
      </div>

      {issues.length > 0 && (
        <div className="card err mb-3" role="alert">
          {issues.map((iss, i) => <p key={i} className="m-0">{issueText(iss, names)}</p>)}
        </div>
      )}

      {rig.fixtures.length === 0 && (
        <div className="card mb-3 muted">No lights yet. Add your first light below.</div>
      )}

      {rig.fixtures.map((f, i) => {
        const profile = profileOf(rig, f);
        const mode = modeOf(rig, f);
        const bad = issues.some((x) => (x.kind === 'overlap' ? x.a === f.id || x.b === f.id : x.id === f.id));
        return (
          <div key={f.id} className={`card mb-3${bad ? ' warn' : ''}`}>
            <div className="row wrap">
              <strong>{nameOf(f, i)}</strong>
              <span className="muted">
                channels {f.address}–{lastChannel(rig, f)} ({footprint(rig, f)} ch{mode ? `, ${pixelCount(mode)} ${(profile?.pixelName ?? 'pixel').toLowerCase()}${pixelCount(mode) === 1 ? '' : 's'}` : ''})
              </span>
              <div className="spacer" />
              <button className="mini" onClick={() => onTest(f.id)}>Test channels</button>
              <button className="mini" disabled={i === 0} aria-label={`Move ${nameOf(f, i)} up`} onClick={() => engine.moveFixture(f.id, -1)}>↑</button>
              <button className="mini" disabled={i === rig.fixtures.length - 1} aria-label={`Move ${nameOf(f, i)} down`} onClick={() => engine.moveFixture(f.id, 1)}>↓</button>
              <button className="mini danger" aria-label={`Remove ${nameOf(f, i)}`} onClick={() => engine.removeFixture(f.id)}>Remove</button>
            </div>
            <div className="grid g4 mt-2">
              <div>
                <label>Name</label>
                <input value={f.name} placeholder={`Light ${i + 1}`} aria-label={`Light ${i + 1} name`}
                  onChange={(e) => engine.updateFixture(f.id, { name: e.target.value })} />
              </div>
              <div>
                <label>Light type</label>
                <select value={f.profileId} aria-label={`${nameOf(f, i)} light type`}
                  onChange={(e) => engine.updateFixture(f.id, { profileId: e.target.value })}>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.builtIn ? '' : ' (custom)'}</option>)}
                </select>
              </div>
              <div>
                <label>DMX mode</label>
                <select value={f.modeId} aria-label={`${nameOf(f, i)} DMX mode`}
                  onChange={(e) => engine.updateFixture(f.id, { modeId: e.target.value })}>
                  {profile?.modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label>Start address</label>
                <input type="number" min={1} max={512} value={f.address} aria-label={`${nameOf(f, i)} start address`}
                  onChange={(e) => engine.updateFixture(f.id, { address: e.target.value === '' ? 1 : Number(e.target.value) })} />
              </div>
            </div>
            <div className="mt-2">
              <AddressOnLight profile={profile} address={f.address} />
              {mode?.note && <span className="muted"> · {mode.note}</span>}
            </div>
            {profile?.unverified && (
              <p className="muted mt-2 mb-0">
                ⚠ This light type's channel layout isn't confirmed by a manual. Run <em>Test channels</em> and, if it's
                wrong, use <em>Copy and edit this type</em> to fix it.
                {' '}<button className="mini" onClick={() => setEditing({ ...profile, id: undefined, name: `${profile.name} (my copy)`, builtIn: false, unverified: false })}>Copy and edit this type</button>
              </p>
            )}
          </div>
        );
      })}

      <div className="card mb-3">
        <h3 className="m-0">Add a light</h3>
        <div className="grid g3 mt-2">
          <div>
            <label>Light type</label>
            <select value={addProfile} aria-label="Type of light to add"
              onChange={(e) => { setAddProfile(e.target.value); setAddMode(profiles.find((p) => p.id === e.target.value)?.modes[0].id ?? ''); }}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.builtIn ? '' : ' (custom)'}</option>)}
            </select>
          </div>
          <div>
            <label>DMX mode</label>
            <select value={addMode} aria-label="DMX mode of light to add" onChange={(e) => setAddMode(e.target.value)}>
              {addProfileObj.modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <button className="primary" disabled={rig.fixtures.length >= MAX_FIXTURES}
              onClick={() => engine.addFixture(addProfile, addMode)}>Add to the chain</button>
          </div>
        </div>
        <p className="muted mt-2 mb-0">It gets the first free address after the lights already on the chain.</p>
      </div>

      <div className="card">
        <div className="row wrap">
          <h3 className="m-0">Custom light types</h3>
          <div className="spacer" />
          <button className="mini" onClick={() => setEditing({ name: 'New light type', addressing: 'display', modes: [{ id: 'mode1', name: '3-CH', channels: [{ type: 'red', home: 0 }, { type: 'green', home: 0 }, { type: 'blue', home: 0 }] }] })}>
            + New light type</button>
        </div>
        <p className="muted mt-2">
          For lights that aren't in the list, or whose channels turn out different from the manual. Find out what each
          channel does with <em>Tools → Channel tester</em>, then describe it here.
        </p>
        {rig.customProfiles.length === 0 && <p className="muted mb-0">None yet.</p>}
        {rig.customProfiles.map((p) => {
          const used = rig.fixtures.some((f) => f.profileId === p.id);
          return (
            <div key={p.id} className="row wrap mb-2">
              <span>{p.name}</span>
              <span className="muted">{p.modes.map((m) => `${m.name} (${m.channels.length} ch)`).join(', ')}</span>
              <div className="spacer" />
              <button className="mini" onClick={() => setEditing(p)}>Edit</button>
              <button className="mini danger" disabled={used} title={used ? 'A light in the rig uses this type' : ''}
                onClick={() => engine.deleteProfile(p.id)}>Delete</button>
            </div>
          );
        })}
      </div>
    </>
  );
}
