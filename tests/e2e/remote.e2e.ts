import { randomUUID } from "node:crypto"
import { expect } from "e2e"
import { test } from "./control"

test.describe("Remote account journeys", { platforms: ["control"] }, () => {
  test("revoking one of two devices survives re-registration without affecting the other", async ({
    control,
  }) => {
    const first = randomUUID()
    const second = randomUUID()
    for (const [deviceId, name] of [
      [first, "Laptop"],
      [second, "Build host"],
    ]) {
      expect(
        (
          await control.request("/api/remote/v1/devices", {
            method: "POST",
            body: { deviceId, name },
          })
        ).status,
      ).toBe(200)
    }
    expect(
      (await control.request(`/api/remote/v1/devices/${first}`, { method: "DELETE" })).status,
    ).toBe(200)
    const listed = await control.request("/api/remote/v1/devices")
    expect(listed.status).toBe(200)
    expect((listed.body as { id: string }[]).map((device) => device.id)).toEqual([second])
    const restored = await control.request("/api/remote/v1/devices", {
      method: "POST",
      body: { deviceId: first, name: "Reinstalled laptop" },
    })
    expect(restored.status).toBe(200)
    const devices = (await control.request("/api/remote/v1/devices")).body as {
      id: string
      name: string
    }[]
    expect(devices.length).toBe(2)
    expect(devices.find((device) => device.id === first)?.name).toBe("Reinstalled laptop")
    expect(devices.find((device) => device.id === second)?.name).toBe("Build host")
  })

  test("invalid and untrusted registration cannot mutate the device list, and sign-out revokes access", async ({
    control,
  }) => {
    const deviceId = randomUUID()
    expect(
      (
        await control.request("/api/remote/v1/devices", {
          method: "POST",
          body: { deviceId, name: "" },
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await control.request("/api/remote/v1/devices", {
          method: "POST",
          authenticated: false,
          origin: "https://untrusted.example",
          body: { deviceId, name: "Intruder" },
        })
      ).status,
    ).toBe(403)
    expect((await control.request("/api/remote/v1/devices")).body).toEqual([])
    expect((await control.request("/api/remote/v1/devices", { authenticated: false })).status).toBe(
      401,
    )
    expect((await control.request("/api/auth/sign-out", { method: "POST", body: {} })).status).toBe(
      200,
    )
    expect((await control.request("/api/remote/v1/devices")).status).toBe(401)
  })
})
