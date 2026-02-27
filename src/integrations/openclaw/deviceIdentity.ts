import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { generateKeyPairSync } from "node:crypto";

export type DeviceIdentity = {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  createdAt: string;
};

export class OpenClawDeviceIdentityStore {
  constructor(private readonly identityPath: string) {}

  async loadOrCreate(deviceId: string): Promise<DeviceIdentity> {
    const existing = await this.load();
    if (existing) {
      if (existing.deviceId !== deviceId) {
        const rotated = this.generate(deviceId);
        await this.save(rotated);
        return rotated;
      }
      return existing;
    }

    const created = this.generate(deviceId);
    await this.save(created);
    return created;
  }

  private async load(): Promise<DeviceIdentity | null> {
    try {
      const raw = await readFile(this.identityPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<DeviceIdentity>;
      if (
        typeof parsed.deviceId !== "string" ||
        typeof parsed.publicKeyPem !== "string" ||
        typeof parsed.privateKeyPem !== "string"
      ) {
        return null;
      }
      return {
        deviceId: parsed.deviceId,
        publicKeyPem: parsed.publicKeyPem,
        privateKeyPem: parsed.privateKeyPem,
        createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString()
      };
    } catch {
      return null;
    }
  }

  private generate(deviceId: string): DeviceIdentity {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });

    return {
      deviceId,
      publicKeyPem: publicKey,
      privateKeyPem: privateKey,
      createdAt: new Date().toISOString()
    };
  }

  private async save(identity: DeviceIdentity): Promise<void> {
    const dir = dirname(this.identityPath);
    await mkdir(dir, { recursive: true });
    await writeFile(this.identityPath, JSON.stringify(identity, null, 2), { encoding: "utf8", mode: 0o600 });
  }
}

