"use client";

// Верх екрана вибору рівня: ваше фото в центрі, довкола обертаються виконавці з карти.

import { avatarBackground } from "@/lib/map/avatar-style";
import type { Performer } from "@/lib/map/types";

export namespace PlacementFacesTypes {
  export type Props = { people: Performer[]; photo: string; name: string };
}

export const PlacementFaces = ({ people, photo, name }: PlacementFacesTypes.Props) => (
  <div className="place-faces" aria-hidden="true">
    {people.slice(0, 6).map((person, index) => (
      <span key={person.id} className="place-face-orbiter" style={{ "--orbit-angle": `${index * 60}deg` } as React.CSSProperties}>
        <span className="place-face place-face-orbit-avatar" style={avatarBackground(person)} />
      </span>
    ))}
    <span className="place-face place-face-center" style={photo ? { backgroundImage: `url(${photo})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
      {!photo && name.trim().charAt(0)}
    </span>
  </div>
);
