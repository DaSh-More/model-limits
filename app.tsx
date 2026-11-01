import { definePluginApp } from "@get-bb/plugin-sdk/app";

import { LimitsPage } from "./components/LimitsPage";
import { LimitsPill } from "./components/LimitsPill";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "limits",
    title: "Лимиты",
    icon: "Gauge",
    path: "limits",
    component: LimitsPage,
  });
  app.slots.experimental_appOverlay({ id: "pill", component: LimitsPill });
});
