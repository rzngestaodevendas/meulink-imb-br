import { describe, expect, it } from "vitest";
import { bulkPropertyInput, propertyPayload } from "./routers";

describe("propertyPayload", () => {
  it("accepts a complete public property payload", () => {
    const result = propertyPayload.safeParse({
      title: "Apartamento Sofia Palace 1207",
      address: "Rua Guilherme Guitmann 827, Zona Nova, Capão da Canoa",
      details: ["02 dormitórios", "56,97 M²", "Box"],
      price: "R$ 1.000.000,00",
      notes: "Disponível para atendimento",
      photos: ["/manus-storage/sofia-1207.jpg"],
      status: "available",
      publicEnabled: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an invalid status and malformed photo URL", () => {
    const result = propertyPayload.safeParse({
      title: "Imóvel inválido",
      details: [],
      photos: ["foto-local-sem-url"],
      status: "draft",
      publicEnabled: true,
    });

    expect(result.success).toBe(false);
  });

  it("applies safe defaults for optional text fields", () => {
    const result = propertyPayload.parse({
      title: "Terreno novo",
      details: ["450 M²"],
      photos: [],
      status: "hidden",
      publicEnabled: false,
    });

    expect(result.address).toBe("");
    expect(result.price).toBe("");
    expect(result.notes).toBe("");
  });

  it("accepts a batch of normalized properties", () => {
    const result = bulkPropertyInput.safeParse({ rows: [{ title: "Casa Horizonte", details: ["03 dormitórios"], photos: ["https://cdn.example.com/casa.jpg"], status: "available", publicEnabled: true }] });
    expect(result.success).toBe(true);
  });
});
