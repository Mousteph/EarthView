import type { CSSProperties, RefCallback, RefObject } from "react";
import { isInternationalSpaceStation, type OrbitalMode, type Satellite, type SelectedSatellitePosition } from "./model";
import { missionTypeColor } from "./colors";
import { InspectionPanel } from "@/shared/ui/InspectionPanel";
import { formatCoordinates } from "@/shared/ui/format";
import { ISSLiveSection } from "./ISSLiveSection";

export function OrbitalDetails({ event: satellite, mode, position, detailsRef, onClose, issPlayerVisible, issPlayerDetached, issVideoUnavailable,
  onInlinePlayerHost, onDetachISSPlayer, onRetryISSPlayer, onShowISSPlayer }: {
  readonly event: Satellite;
  readonly mode: OrbitalMode;
  readonly position: SelectedSatellitePosition | null;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly issPlayerVisible: boolean;
  readonly issPlayerDetached: boolean;
  readonly issVideoUnavailable: boolean;
  readonly onInlinePlayerHost: RefCallback<HTMLDivElement>;
  readonly onDetachISSPlayer: () => void;
  readonly onRetryISSPlayer: () => void;
  readonly onShowISSPlayer: () => void;
}) {
  const objectLabel = mode === "active" ? "Satellite" : mode === "debris" ? "Debris" : "Rocket body";
  const isISS = isInternationalSpaceStation(satellite);
  const operational = satellite.operationalStatus === "active" ? true : satellite.operationalStatus === "inactive" ? false : null;
  const sections: readonly [string, readonly (readonly [string, string | null | undefined])[]][] = [
    ["Identity", [["NORAD ID", String(satellite.noradId)], ["International designator", satellite.internationalDesignator], ["Object type", satellite.objectType], ["Mission type", mode === "active" ? satellite.missionType : null], ["Constellation / group", mode === "active" ? satellite.constellation : null]]],
    ["Ownership", [["Owner / source", satellite.owner], ["Launch date", satellite.launchDate], ["Launch site", satellite.launchSite]]],
    ["Orbit", [["Orbit class", satellite.orbitClass], [satellite.apsidesEstimated ? "Apogee (est.)" : "Apogee", satellite.apogeeKm == null ? null : `${satellite.apogeeKm.toFixed(1)} km`], [satellite.apsidesEstimated ? "Perigee (est.)" : "Perigee", satellite.perigeeKm == null ? null : `${satellite.perigeeKm.toFixed(1)} km`], ["Inclination", `${satellite.inclination.toFixed(2)}°`], ["Period", `${(satellite.orbitalPeriodMinutes ?? 1440 / satellite.meanMotion).toFixed(1)} min`], ["Orbits per day", (satellite.orbitsPerDay ?? satellite.meanMotion).toFixed(2)]]],
  ];

  return <InspectionPanel ariaLabel={`Selected ${objectLabel.toLowerCase()}`} closeLabel={`Close selected ${objectLabel.toLowerCase()}`} detailsRef={detailsRef} onClose={onClose}>
    <div className="event-details-heading"><span>{objectLabel}</span></div>
    <div className="event-primary">
      <div className="satellite-primary-label">{satellite.name}</div>
      <div className="orbital-primary-badges">
        {mode === "active" ? <>
          {satellite.missionType ? <span className="orbital-info-pill orbital-mission-pill" style={{ "--orbital-mission-color": missionTypeColor(satellite.missionType) } as CSSProperties}>{satellite.missionType}</span> : null}
          {satellite.orbitClass ? <span className="orbital-info-pill">{satellite.orbitClass}</span> : null}
          {satellite.constellation ? <span className="orbital-info-pill">{satellite.constellation}</span> : null}
        </> : null}
        {operational !== null ? <span className={`orbital-status-pill ${operational ? "is-active" : "is-inactive"}`}><i aria-hidden="true" />{operational ? "Active" : "Inactive"}</span> : null}
      </div>
    </div>
    <div className="orbital-detail-section orbital-live-position-section">
      <h3>Live Position</h3>
      <dl>
        <div className="live-coordinate-row"><dt>Latitude / longitude</dt><dd>{position ? formatCoordinates(position.latitude, position.longitude) : "Calculating"}</dd></div>
        <div><dt>Altitude</dt><dd>{position ? `${position.altitudeKm.toFixed(1)} km` : "Calculating"}</dd></div>
        <div><dt>Velocity</dt><dd>{position ? `${position.velocityKmS.toFixed(2)} km/s` : "Calculating"}</dd></div>
      </dl>
    </div>
    {isISS ? <ISSLiveSection visible={issPlayerVisible} detached={issPlayerDetached} unavailable={issVideoUnavailable}
      inlineHostRef={onInlinePlayerHost} onDetach={onDetachISSPlayer}
      onRetry={onRetryISSPlayer} onShow={onShowISSPlayer} /> : null}
    {sections.map(([title, rows]) => {
      const availableRows = rows.filter(([, value]) => value != null && value !== "");
      return availableRows.length ? <div className="orbital-detail-section" key={title}>
        <h3>{title}</h3><dl>{availableRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </div> : null;
    })}
  </InspectionPanel>;
}
