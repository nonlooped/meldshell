import { Layer, ManagedRuntime } from "effect"
import { CoreClient } from "./core-client"
import { DesktopEvents, eventDeliveryLive } from "./desktop-events"
import { codexProviderLive, claudeProviderLive, cursorProviderLive } from "./worker-provider"
import { getMainWindow } from "../window"

const BaseLive = Layer.merge(CoreClient.Default, DesktopEvents.Default)
const MainLive = Layer.mergeAll(
  codexProviderLive(getMainWindow),
  claudeProviderLive(getMainWindow),
  cursorProviderLive(getMainWindow),
  eventDeliveryLive(getMainWindow),
).pipe(Layer.provideMerge(BaseLive))
export const runtime = ManagedRuntime.make(MainLive)
