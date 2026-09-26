export type ResponsibleLink = {
  propertyId: number;
  responsibleName: string | null;
  responsiblePhone: string | null;
};

export type ScopedProperty = {
  id: number;
  responsibleName: string | null;
  responsiblePhone: string | null;
};

const normalizeResponsible = (value: string | null | undefined) => value?.trim().toLocaleLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ") || "";

/** Applies the per-table responsible override without mutating the source property. */
export function applyResponsibleScope<T extends ScopedProperty>(properties: T[], links: ResponsibleLink[], responsibleName?: string): T[] {
  const requested = normalizeResponsible(responsibleName);
  const linksById = new Map(links.map(link => [link.propertyId, link]));
  return properties.flatMap(property => {
    const link = linksById.get(property.id);
    const effectiveName = link?.responsibleName?.trim() || property.responsibleName;
    if (requested && normalizeResponsible(effectiveName) !== requested) return [];
    return [{
      ...property,
      responsibleName: effectiveName,
      responsiblePhone: link?.responsiblePhone?.trim() || property.responsiblePhone,
    }];
  });
}
