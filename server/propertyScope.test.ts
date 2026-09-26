import { describe, expect, it } from "vitest";
import { applyResponsibleScope } from "./propertyScope";

type Property = { id: number; responsibleName: string | null; responsiblePhone: string | null; title: string };

const properties: Property[] = [
  { id: 1, title: "Imóvel original", responsibleName: "Origem", responsiblePhone: "5511111111111" },
  { id: 2, title: "Imóvel vinculado", responsibleName: "Origem", responsiblePhone: "5511111111111" },
  { id: 3, title: "Sem responsável", responsibleName: null, responsiblePhone: null },
];

describe("applyResponsibleScope", () => {
  it("uses the responsible override saved for the current table", () => {
    const scoped = applyResponsibleScope(properties, [
      { propertyId: 2, responsibleName: "Marcelo Bereta", responsiblePhone: "5551999287700" },
    ]);
    expect(scoped.find(property => property.id === 2)).toMatchObject({ responsibleName: "Marcelo Bereta", responsiblePhone: "5551999287700" });
    expect(scoped.find(property => property.id === 1)?.responsibleName).toBe("Origem");
  });

  it("returns only the selected responsible without leaking another profile", () => {
    const scoped = applyResponsibleScope(properties, [
      { propertyId: 1, responsibleName: "Alisson Portella", responsiblePhone: "5511111111111" },
      { propertyId: 2, responsibleName: "Marcelo Bereta", responsiblePhone: "5551999287700" },
    ], "marcelo-bereta");
    expect(scoped.map(property => property.id)).toEqual([2]);
  });

  it("keeps the full table and does not duplicate linked properties", () => {
    const scoped = applyResponsibleScope(properties, [
      { propertyId: 1, responsibleName: "Alisson Portella", responsiblePhone: null },
      { propertyId: 2, responsibleName: "Marcelo Bereta", responsiblePhone: null },
    ]);
    expect(scoped.map(property => property.id)).toEqual([1, 2, 3]);
    expect(new Set(scoped.map(property => property.id)).size).toBe(scoped.length);
  });
});
