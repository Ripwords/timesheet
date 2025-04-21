<script setup lang="ts">
import { moveWindow, Position } from "@tauri-apps/plugin-positioner"
import { TrayIcon } from "@tauri-apps/api/tray"
import { Menu } from "@tauri-apps/api/menu"
import { getCurrentWindow } from "@tauri-apps/api/window"

const resetWindow = () => {
  moveWindow(Position.TopRight)
  appWindow.setFocus()
  appWindow.show()
}

const menu = await Menu.new({
  items: [
    {
      id: "show",
      text: "Show",
      action: resetWindow,
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
  showMenuOnLeftClick: false,
  menu,
  action: (event) => {
    switch (event.type) {
      case "Click":
        ;(() => {
          if (event.button === "Left") {
            resetWindow()
          }
        })()
        break
    }
  },
})

moveWindow(Position.TopRight)
const appWindow = getCurrentWindow()
await appWindow.setAlwaysOnTop(true)
await appWindow.setSkipTaskbar(true)
await appWindow.listen("tauri://close-requested", () => {
  appWindow.hide()
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
