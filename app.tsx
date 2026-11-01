import { definePluginApp } from "@get-bb/plugin-sdk/app";

function LimitsPage() {
  return null;
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "limits",
    title: "Лимиты",
    icon: "Gauge",
    path: "limits",
    component: LimitsPage,
  });
});
