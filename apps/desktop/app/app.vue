<script setup lang="ts">
import { moveWindow, Position } from "@tauri-apps/plugin-positioner"
import { TrayIcon } from "@tauri-apps/api/tray"
import { Menu } from "@tauri-apps/api/menu"
import { getCurrentWindow } from "@tauri-apps/api/window"

const menu = await Menu.new({
  items: [
    {
      id: "show",
      text: "Show",
      action: async () => {
        moveWindow(Position.TopRight)
        appWindow.setFocus()
        appWindow.show()
      },
    },
    {
      id: "hide",
      text: "Hide",
      action: () => {
        appWindow.hide()
      },
    },
    {
      id: "quit",
      text: "Quit",
      action: () => {
        appWindow.destroy()
      },
    },
  ],
})

await TrayIcon.new({
  icon: "icons/icon.png",
  menu,
  menuOnLeftClick: true,
})

moveWindow(Position.TopRight)
const appWindow = getCurrentWindow()
await appWindow.setAlwaysOnTop(true)
await appWindow.setSkipTaskbar(true)
await appWindow.listen("tauri://close-requested", () => {
  appWindow.minimize()
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
