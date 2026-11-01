import { definePluginApp } from "@get-bb/plugin-sdk/app";

import { LimitsPage } from "./components/LimitsPage";

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "limits",
    title: "Лимиты",
    icon: "Gauge",
    path: "limits",
    component: LimitsPage,
  });
});
